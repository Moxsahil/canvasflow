// Starts a throwaway Postgres 17 on 127.0.0.1:54329, applies the repo's
// drizzle migrations and seeds one user/session/workspace/board.
// Writes the seed ids to results/seed.json and stays up until SIGINT/SIGTERM.
import EmbeddedPostgres from 'embedded-postgres';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { HERE, ROOT, PG_PORT, LOCAL_DB_URL, pg, assertLocal } from './lib.mjs';

assertLocal(LOCAL_DB_URL);
const dataDir = resolve(HERE, '.pgdata');
rmSync(dataDir, { recursive: true, force: true });

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PG_PORT,
  persistent: false,
  onLog: () => {},
});
await server.initialise();
await server.start();
await server.createDatabase('canvasflow');

const fromDb = createRequire(resolve(ROOT, 'packages/db/package.json'));
const { drizzle } = fromDb('drizzle-orm/node-postgres');
const { migrate } = fromDb('drizzle-orm/node-postgres/migrator');
const pool = new pg.Pool({ connectionString: LOCAL_DB_URL });
await migrate(drizzle(pool), { migrationsFolder: resolve(ROOT, 'packages/db/migrations') });

const q = (s, p) => pool.query(s, p).then((r) => r.rows[0]);
const email = 'metrics@localhost.test';
const user = await q(`insert into users (email, name) values ($1, 'Metrics') returning id`, [
  email,
]);
const session = await q(
  `insert into auth_sessions (user_id, expires_at) values ($1, now() + interval '7 days') returning id`,
  [user.id],
);
const ws = await q(`insert into workspace (name, slug) values ('Metrics', 'metrics') returning id`);
await q(`insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')`, [
  ws.id,
  user.id,
]);
const board = await q(
  `insert into boards (workspace_id, title, owner_id) values ($1, 'Metrics board', $2) returning id`,
  [ws.id, user.id],
);
const seed = {
  userId: user.id,
  email,
  sessionId: session.id,
  workspaceId: ws.id,
  boardId: board.id,
};
mkdirSync(resolve(HERE, 'results'), { recursive: true });
writeFileSync(resolve(HERE, 'results/seed.json'), JSON.stringify(seed, null, 2));
const { rows } = await pool.query(`select version()`);
console.log('READY', rows[0].version.split(',')[0], JSON.stringify(seed));
await pool.end();

const stop = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
