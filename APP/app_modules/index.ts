import express from "express";
import cors from "cors";
import { errorHandler } from "../../CORE/middleware/errorHandler";
import { logger } from "../../CORE/logger";
import { requestLogger } from "../../CORE/middleware/requestLogger";
import http from "http";
import { modules } from "../app_routers";
import { mountRouters } from "../../CORE/middleware/router";
import { connectDatabase, disconnectDatabase } from "../../CORE/services/db";
import { connectRedis, disconnectRedis } from "../../CORE/services/redis";
import { config } from "../../CORE/config";
import { connectKafkaProducer, disconnectKafkaProducer } from "../../CORE/services/kafka";
import { startOnboardingCleanupWorker, stopOnboardingCleanupWorker } from "../../CORE/workers/onboardingCleanup";
import { initSocket, startSocketRedisBridge } from "../../CORE/services/socket";
import {getMetrics} from"../../CORE/services/prometheus/"
const app = express();

app.set('etag', false);
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400,
}));


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.get('/metrics', getMetrics);

const httpServer = http.createServer(app);

mountRouters(app, modules);
app.use(errorHandler);

async function startServer(): Promise<void> {
    await connectDatabase();
    await connectRedis();
    await connectKafkaProducer();
    startOnboardingCleanupWorker();
    initSocket(httpServer);
    await startSocketRedisBridge();

    httpServer.listen(config.port, () => {
        logger.info({ port: config.port, env: config.env, version: config.apiVersion }, 'CORE LABS IDENTITY SERVICE STARTED');
    });
}

async function gracefulShutdown(signal: string): Promise<void> {
    logger.warn({ signal }, 'Shutdown signal received');

    httpServer.close(async () => {
        try {
            // getSocketServer().close();

            // await klingLongVideoWorker.close();
            await disconnectDatabase();
            await disconnectRedis();
            await disconnectKafkaProducer();
            stopOnboardingCleanupWorker();
            logger.info('Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            logger.error({ err }, 'Shutdown error');
            process.exit(1);
        }
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer().catch((err) => {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
});
