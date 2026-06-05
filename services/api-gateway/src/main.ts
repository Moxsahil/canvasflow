// ⚠️ Telemetry MUST be initialized before any other imports
// so auto-instrumentations can patch libraries as they load.
import 'reflect-metadata';
import { parseEnv } from './config/env.js';
import { initTelemetry } from './infra/telemetry/telemetry.js';

const env = parseEnv();
initTelemetry(env.OTEL_SERVICE_NAME, env.OTEL_EXPORTER_OTLP_ENDPOINT);

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // CORS — locked down by default, opens up in higher environments
  app.enableCors({
    origin: env.NODE_ENV === 'production' ? false : 'http://localhost:3000',
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
