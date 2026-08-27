// ⚠️ Telemetry MUST be initialized before any other imports
// so auto-instrumentations can patch libraries as they load.
import 'reflect-metadata';
import { parseEnv } from './config/env.js';
import { initTelemetry } from './infra/telemetry/telemetry.js';

const env = parseEnv();
initTelemetry(env.OTEL_SERVICE_NAME, env.OTEL_EXPORTER_OTLP_ENDPOINT);

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import express from 'express';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

/**
 * Room for one Yjs update, which is the largest body this API takes.
 *
 * Images used to be larger and set this ceiling, back when their bytes were
 * posted through here. They now go straight from the browser to object storage
 * over a signed URL, so nothing on this server ever holds one and the limit
 * only has to cover the board snapshots.
 */
const MAX_REQUEST_BODY = '2mb';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.use(express.json({ limit: MAX_REQUEST_BODY }));

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3002'];
  const PROD_ORIGINS = [env.WEB_URL, env.EDITOR_URL].filter((url): url is string => Boolean(url));

  const allowedOrigins = env.NODE_ENV === 'production' ? PROD_ORIGINS : DEV_ORIGINS;

  if (env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
    logger.warn('⚠️  No PROD_ORIGINS configured. Set WEB_URL and EDITOR_URL env vars.');
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  await app.listen(env.PORT);
  logger.log(`🚀 api-gateway listening on http://localhost:${env.PORT}`);
  logger.log(`   Environment: ${env.NODE_ENV}`);
}

bootstrap().catch((err) => {
  console.error('Fatal: failed to start api-gateway', err);
  process.exit(1);
});
