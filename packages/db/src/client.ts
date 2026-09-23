import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';
import pg from 'pg';

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

/**
 * One client per database per process, however many modules ask.
 *
 * The web app calls this at the top of every route file, and each call used to
 * open its own pool — so each route paid a fresh TCP, TLS and auth handshake
 * (about half a second to the database's region) on its first request, and
 * held idle connections nobody else could use. Kept on `globalThis` rather
 * than in a module variable because the dev server reloads modules on every
 * edit, and a module-level cache would be dropped with them while the old
 * pools stayed open.
 */
const clients: Map<string, Database> = ((
  globalThis as { __canvasflowDbClients?: Map<string, Database> }
).__canvasflowDbClients ??= new Map());

export function createClient(connectionString: string): Database {
  const existing = clients.get(connectionString);
  if (existing) return existing;

  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    // Neon's serverless compute autosuspends when idle; waking it back up
    // (cold start) can take several seconds, so this needs more headroom
    // than a typical always-on Postgres connection timeout.
    connectionTimeoutMillis: 15_000,
  });

  const db = drizzle(pool, { schema, logger: process.env.NODE_ENV === 'development' });
  clients.set(connectionString, db);
  return db;
}

export { schema };
