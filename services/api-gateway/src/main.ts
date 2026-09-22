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
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { allowedOrigins } from './common/allowed-origins.js';

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  /**
   * Whose address a request appears to come from.
   *
   * Behind a proxy the socket address is the proxy itself, so every caller
   * looks identical and a per-IP limit would treat the whole internet as one
   * person, locking everybody out together the first time anyone hit it. Each
   * hop counted here is one proxy that may be believed about who called.
   *
   * Configuration rather than a constant, because the correct number is a fact
   * about the deployment: one behind the host's own proxy, two once a WAF sits
   * in front of it. Getting it too high is not a typo but a hole — every extra
   * hop trusted is one more entry a caller may write into X-Forwarded-For
   * themselves, letting them invent a fresh address per request and walk past
   * the limit. Never `true`, which trusts them all.
   *
   * Zero, the default, disables it: right in development, where there is no
   * proxy and the socket address is already the caller.
   */
  app.set('trust proxy', env.TRUST_PROXY_HOPS > 0 ? env.TRUST_PROXY_HOPS : false);

  app.use(express.json({ limit: MAX_REQUEST_BODY }));

  /**
   * Express does not parse cookies, and this service now reads them: the
   * OAuth state on the way back from a provider, and the session credentials
   * once the clients are moved over.
   *
   * Unsigned on purpose. Nothing here trusts a cookie for its contents — the
   * access token carries its own signature, the refresh token is compared
   * against a stored digest, and the state is compared against what we sent —
   * so a second signing scheme would add a key to rotate and prove nothing
   * that is not already proved.
   */
  app.use(cookieParser());

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const origins = allowedOrigins(env);

  if (env.NODE_ENV === 'production' && origins.length === 0) {
    logger.warn('⚠️  No PROD_ORIGINS configured. Set WEB_URL and EDITOR_URL env vars.');
  }

  app.enableCors({
    origin: origins,
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
