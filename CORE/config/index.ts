import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import dotenv from 'dotenv';

const env = process.env.NODE_ENV || 'development';
const envPaths = [
  path.resolve(process.cwd(), `.env.${env}`),
  path.resolve(process.cwd(), '..', `.env.${env}`),
];

const envPath = envPaths.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_VERSION: z.string().default('v1'),
  SERVICE_VERSION: z.string().default('0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  GRAFANA_LOKI_HOST: z
    .string()
    .optional()
    .transform((s) => (s?.trim() ? s.trim() : undefined)),
  GRAFANA_LOKI_USER_ID: z
    .string()
    .optional()
    .transform((s) => (s?.trim() ? s.trim() : undefined)),
  GRAFANA_LOKI_API_TOKEN: z
    .string()
    .optional()
    .transform((s) => (s?.trim() ? s.trim() : undefined)),

  MONGODB_URI: z.string(),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().default(10),
  DB_RETRY_ATTEMPTS: z.coerce.number().default(5),
  DB_RETRY_DELAY_MS: z.coerce.number().default(2000),

  REDIS_URL: z.string().url(),
  REDIS_TTL_EXCHANGE_RATES: z.coerce.number().default(600),
  REDIS_TTL_SESSION: z.coerce.number().default(3600),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().default(604800),
  REMEMBER_ME_TTL: z.coerce.number().default(2592000),

  OTP_LENGTH: z.coerce.number().default(6),
  OTP_TTL: z.coerce.number().default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  GITHUB_REDIRECT_URI: z.string().url().optional(),

  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_BUCKET: z.string(),
  AWS_SIGNED_URL_TTL: z.coerce.number().default(3600),

  CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),

  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string().email(),

  COINGECKO_API_KEY: z.string().optional(),
  COINGECKO_BASE_URL: z.string().url().default('https://api.coingecko.com/api/v3'),
  EXCHANGE_RATE_CRON: z.string().default('*/5 * * * *'),

  SERVICE_NAME: z.string().default('identity-service'),

  KAFKA_BROKERS: z.string().default('localhost:9094'),
  KAFKA_CLIENT_ID: z.string().default('identity-service'),
  KAFKA_ENABLED: z.coerce.boolean().default(true),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),
  KAFKA_SSL: z.coerce.boolean().optional(),

  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),

  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_SECRET_KEY: z.string().optional(),

  PREMBLY_API_KEY: z.string().optional(),
  PREMBLY_BASE_URL: z.string().url().default('https://api.prembly.com'),

  ONBOARDING_TTL_SECONDS: z.coerce.number().default(86400),
  ONBOARDING_CLEANUP_INTERVAL_MS: z.coerce.number().default(900000),

  FREEMIUM_CREDIT_NGN: z.coerce.number().default(1000),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[CONFIG] Environment validation failed:');
  parsed.error.issues.forEach((issue: z.ZodIssue) => {
    console.error(`  ${issue.path.join('.')} - ${issue.message}`);
  });
  process.exit(1);
}

const e = parsed.data;

export const config = {
  env: e.NODE_ENV,
  port: e.PORT,
  apiVersion: e.API_VERSION,
  logLevel: e.LOG_LEVEL,
  frontendUrl: e.FRONTEND_URL,
  corsOrigin: e.CORS_ORIGIN,
  serviceName: e.SERVICE_NAME,
  serviceVersion: e.SERVICE_VERSION,
  grafanaLoki: {
    host: e.GRAFANA_LOKI_HOST,
    userId: e.GRAFANA_LOKI_USER_ID,
    apiToken: e.GRAFANA_LOKI_API_TOKEN,
  },
  db: {
    uri: e.MONGODB_URI,
    maxPoolSize: e.MONGODB_MAX_POOL_SIZE,
    retryAttempts: e.DB_RETRY_ATTEMPTS,
    retryDelayMs: e.DB_RETRY_DELAY_MS,
  },
  redis: {
    url: e.REDIS_URL,
    ttlExchangeRates: e.REDIS_TTL_EXCHANGE_RATES,
    ttlSession: e.REDIS_TTL_SESSION,
  },
  jwt: {
    accessSecret: e.JWT_ACCESS_SECRET,
    refreshSecret: e.JWT_REFRESH_SECRET,
    accessTtl: e.ACCESS_TOKEN_TTL,
    refreshTtl: e.REFRESH_TOKEN_TTL,
    rememberMeTtl: e.REMEMBER_ME_TTL,
  },
  otp: {
    length: e.OTP_LENGTH,
    ttl: e.OTP_TTL,
    resendCooldownSeconds: e.OTP_RESEND_COOLDOWN_SECONDS,
  },
  google: {
    clientId: e.GOOGLE_CLIENT_ID,
    clientSecret: e.GOOGLE_CLIENT_SECRET,
    redirectUri: e.GOOGLE_REDIRECT_URI,
  },
  github: {
    clientId: e.GITHUB_CLIENT_ID,
    clientSecret: e.GITHUB_CLIENT_SECRET,
    redirectUri: e.GITHUB_REDIRECT_URI ?? e.GOOGLE_REDIRECT_URI,
  },
  aws: {
    accessKeyId: e.AWS_ACCESS_KEY_ID,
    secretAccessKey: e.AWS_SECRET_ACCESS_KEY,
    region: e.AWS_REGION,
    bucket: e.AWS_BUCKET,
    signedUrlTtl: e.AWS_SIGNED_URL_TTL,
  },
  cloudinary: {
    cloudName: e.CLOUDINARY_CLOUD_NAME,
    apiKey: e.CLOUDINARY_API_KEY,
    apiSecret: e.CLOUDINARY_API_SECRET,
  },
  email: {
    resendApiKey: e.RESEND_API_KEY,
    from: e.EMAIL_FROM,
  },
  coingecko: {
    apiKey: e.COINGECKO_API_KEY,
    baseUrl: e.COINGECKO_BASE_URL,
    cron: e.EXCHANGE_RATE_CRON,
  },
  freemium: {
    creditNgn: e.FREEMIUM_CREDIT_NGN,
  },
  kafka: {
    brokers: e.KAFKA_BROKERS.split(',').map((broker) => broker.trim()).filter(Boolean),
    clientId: e.KAFKA_CLIENT_ID,
    enabled: e.KAFKA_ENABLED,
    saslUsername: e.KAFKA_SASL_USERNAME,
    saslPassword: e.KAFKA_SASL_PASSWORD,
    ssl: e.KAFKA_SSL,
  },
  privy: {
    appId: e.PRIVY_APP_ID ?? '',
    appSecret: e.PRIVY_APP_SECRET ?? '',
  },
  paystack: {
    publicKey: e.PAYSTACK_PUBLIC_KEY ?? '',
    secretKey: e.PAYSTACK_SECRET_KEY ?? '',
  },
  prembly: {
    apiKey: e.PREMBLY_API_KEY ?? '',
    baseUrl: e.PREMBLY_BASE_URL,
  },
  onboarding: {
    ttlSeconds: e.ONBOARDING_TTL_SECONDS,
    cleanupIntervalMs: e.ONBOARDING_CLEANUP_INTERVAL_MS,
  },
} as const;

export type Config = typeof config;
