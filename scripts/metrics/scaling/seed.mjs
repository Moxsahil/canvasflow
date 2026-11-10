// Applies the repo's migrations to the lab's Postgres (published on
// 127.0.0.1:55432 by infra/scaling/docker-compose.yml) and seeds one user,
// session, workspace and board. Writes the ids to results/seed.json, which
// the load scripts read.
//
//   node scripts/metrics/scaling/seed.mjs [--spare-boards=200]
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { HERE, RESULTS, assertLocal } from './lib.mjs';

const DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55432/canvasflow';
assertLocal(DATABASE_URL);

const ROOT = resolve(HERE, '../../..');
const fromDb = createRequire(resolve(ROOT, 'packages/db/package.json'));
const pg = fromDb('pg');
const { drizzle } = fromDb('drizzle-orm/node-postgres');
const { migrate } = fromDb('drizzle-orm/node-postgres/migrator');

const pool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(pool), { migrationsFolder: resolve(ROOT, 'packages/db/migrations') });

const q = (s, p) => pool.query(s, p).then((r) => r.rows[0]);
const email = 'scaling@localhost.test';
// Re-running is fine: the user is reused, everything else is created afresh.
const user = await q(
  `insert into users (email, name) values ($1, 'Scaling')
   on conflict (email) do update set name = excluded.name returning id`,
  [email],
);
const session = await q(
  `insert into auth_sessions (user_id, expires_at) values ($1, now() + interval '7 days') returning id`,
  [user.id],
);
const ws = await q(
  `insert into workspace (name, slug) values ('Scaling', 'scaling-' || floor(random() * 1e9)::text) returning id`,
);
await q(`insert into memberships (workspace_id, user_id, role) values ($1, $2, 'owner')`, [
  ws.id,
  user.id,
]);
const board = await q(
  `insert into boards (workspace_id, title, owner_id) values ($1, 'Scaling board', $2) returning id`,
  [ws.id, user.id],
);
// Spare boards for scripts that need a room nobody has opened yet
// (redis-unload-race.mjs uses one per trial).
const spare = Number(process.argv.find((a) => a.startsWith('--spare-boards='))?.split('=')[1] ?? 0);
const spareBoards = [];
for (let i = 0; i < spare; i++) {
  const b = await q(
    `insert into boards (workspace_id, title, owner_id) values ($1, $2, $3) returning id`,
    [ws.id, `Spare ${i}`, user.id],
  );
  spareBoards.push(b.id);
}
const seed = {
  spareBoards,
  userId: user.id,
  email,
  sessionId: session.id,
  workspaceId: ws.id,
  boardId: board.id,
};
mkdirSync(RESULTS, { recursive: true });
writeFileSync(resolve(RESULTS, 'seed.json'), JSON.stringify(seed, null, 2));
const { rows } = await pool.query(`select version()`);
console.log('seeded', rows[0].version.split(',')[0], JSON.stringify(seed));
await pool.end();
