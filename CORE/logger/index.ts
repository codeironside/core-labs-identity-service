import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { type Logger as PinoLogger } from 'pino';
import { config } from '../config/index.js';
import {
    buildGrafanaLokiTransportTarget,
    isGrafanaLokiConfigured,
} from './lokiTransport.js';

interface LogContext {
    requestId?: string;
    userId?: string;
    [key: string]: unknown;
}

export const loggerContext = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
    return loggerContext.run(context, fn);
}

const env = config.env;
const isDev = env === 'development';
const isTest = env === 'test';

const SERVICE_NAME = config.serviceName ?? 'identity-service';
const SERVICE_VERSION = config.serviceVersion ?? '0.0.0';

const level = config.logLevel ?? (isDev ? 'debug' : isTest ? 'silent' : 'info');

const redact = {
    paths: [
        'password',
        'newPassword',
        '*.password',
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.apiKey',
        '*.secret',
        'authorization',
        'cookie',
    ],
    censor: '[REDACTED]',
    remove: false,
};

const serializers = {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
};

const targets: pino.TransportTargetOptions[] = [];

if (isDev) {
    targets.push({
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false,
        },
        level: 'debug',
    });
} else if (!isTest) {
    targets.push({
        target: 'pino/file',
        options: { destination: 1 },
        level: 'info',
    });
}

const { host: grafanaLokiHost, userId: grafanaLokiUserId, apiToken: grafanaLokiApiToken } =
    config.grafanaLoki;

if (
    !isTest &&
    grafanaLokiHost !== undefined &&
    grafanaLokiUserId !== undefined &&
    grafanaLokiApiToken !== undefined &&
    isGrafanaLokiConfigured(grafanaLokiHost, grafanaLokiUserId, grafanaLokiApiToken)
) {
    targets.push(
        buildGrafanaLokiTransportTarget(
            {
                host: grafanaLokiHost,
                userId: grafanaLokiUserId,
                apiToken: grafanaLokiApiToken,
            },
            { env },
            level,
        ),
    );
}

const loggerOptions: pino.LoggerOptions = {
    level,
    base: {
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        env,
        pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact,
    serializers,
    mixin() {
        const ctx = loggerContext.getStore();
        return ctx ? { ...ctx } : {};
    },
};

if (targets.length > 0) {
    loggerOptions.transport = { targets, dedupe: true };
}

export const logger: PinoLogger = pino(loggerOptions);

export function createLogger(component: string, bindings: Record<string, unknown> = {}): PinoLogger {
    return logger.child({ component, ...bindings });
}

export function createRequestLogger(requestId: string, extra: Record<string, unknown> = {}): PinoLogger {
    return logger.child({ requestId, ...extra });
}

process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    setTimeout(() => process.exit(1), 100);
});

process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection');
});
