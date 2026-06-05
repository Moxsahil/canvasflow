import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';
import pg from 'pg';

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

export function createClient(connectionString: string): Database {
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  return drizzle(pool, { schema, logger: process.env.NODE_ENV === 'development' });
}

export { schema };
