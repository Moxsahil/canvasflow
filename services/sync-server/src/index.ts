import { parseEnv } from './config/env.js';
import { createLogger } from './logging/logger.js';
import { createSyncServer } from './server.js';

const env = parseEnv();
const log = createLogger(env, { service: 'sync-server' });
const server = createSyncServer(env, { log });

server.start().catch((err) => {
  log.error('fatal: failed to start sync-server', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  log.info('SIGTERM received, shutting down');
  await server.stop();
  process.exit(0);
});
