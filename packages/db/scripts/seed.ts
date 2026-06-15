import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import bcrypt from 'bcrypt';
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import { users, workspaces, memberships, boards } from '../src/schema/index.js';
import { eq } from 'drizzle-orm';
import type { HexColor } from '@canvasflow/types';

const env = parseEnv();

if (env.NODE_ENV === 'production') {
  console.error('❌ Cannot run seed script in production');
  process.exit(1);
}

async function main() {
  const db = createClient(env.DATABASE_URL);

  console.warn('🌱 Seeding development data...');

  const existing = await db.select().from(users).where(eq(users.email, 'mox@dev.local')).limit(1);
  if (existing.length > 0) {
    console.warn('  ↺ User exists; skipping seed');
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash('password123', 12);
  const [user] = await db
    .insert(users)
    .values({
      email: 'mox@dev.local',
      name: 'MOX',
      passwordHash,
      emailVerifiedAt: new Date(),
      preferences: {
        theme: 'system',
        cursorColor: '#6366f1' as HexColor,
        showCursorsOfOthers: true,
        defaultBoardTool: 'select',
      },
    })
    .returning();
  if (!user) throw new Error('Failed to create demo user');
  console.warn(`  ✓ Created user: ${user.email} (password: password123)`);

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Acme Inc', slug: 'acme', plan: 'pro' })
    .returning();
  if (!workspace) throw new Error('Failed to create demo workspace');
  console.warn(`  ✓ Created workspace: ${workspace.name}`);

  await db.insert(memberships).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: 'owner',
  });
  console.warn(`  ✓ Added user as owner`);

  for (const title of ['Q1 Roadmap', 'System Architecture', 'Customer Journey Map']) {
    const [board] = await db
      .insert(boards)
      .values({ workspaceId: workspace.id, ownerId: user.id, title, visibility: 'workspace' })
      .returning();
    if (!board) throw new Error('Failed to create board');
    console.warn(`  ✓ Created board: ${board.title}`);
  }

  console.warn('🌱 Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
