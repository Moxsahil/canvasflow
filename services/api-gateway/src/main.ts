// ⚠️ Telemetry MUST be initialized before any other imports
// so auto-instrumentations can patch libraries as they load.
import 'reflect-metadata';
import { parseEnv } from './config/env.js';
import { initTelemetry } from './infra/telemetry/telemetry.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

const env = parseEnv();
initTelemetry(env.OTEL_SERVICE_NAME, env.OTEL_EXPORTER_OTLP_ENDPOINT);

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { configureApp } from './app-setup.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  configureApp(app, env);

  await app.listen(env.PORT);
  logger.log(`🚀 api-gateway listening on http://localhost:${env.PORT}`);
  logger.log(`   Environment: ${env.NODE_ENV}`);
}

bootstrap().catch((err) => {
  console.error('Fatal: failed to start api-gateway', err);
  process.exit(1);
});
