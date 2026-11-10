import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createClient } from '@canvasflow/db';
import type { GlobalSetupContext } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const MIGRATIONS = resolve(__dirname, '../../../../packages/db/migrations');

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Starts a throwaway Postgres 17 on a free loopback port, applies every repo
 * migration and hands the URL to the tests. Nothing here can reach a remote
 * database: the URL is built from 127.0.0.1, never read from the environment.
 */
export default async function setup({ provide }: GlobalSetupContext) {
  const port = await freePort();
  const pg = new EmbeddedPostgres({
    databaseDir: mkdtempSync(join(tmpdir(), 'canvasflow-gateway-test-')),
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('canvasflow_test');

  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/canvasflow_test`;
  const db = createClient(databaseUrl);
  await migrate(db, { migrationsFolder: MIGRATIONS });
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();

  provide('databaseUrl', databaseUrl);

  return async () => {
    await pg.stop();
  };
}
