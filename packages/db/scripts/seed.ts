import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import { parseEnv } from '../src/env.js';
import type { HexColor } from '@canvasflow/types';
import { createClient } from '../src/client.js';
import { users, workspaces, memberships, boards } from '../src/schema/index.js';

const env = parseEnv();

// 🚨 SAFETY GUARD — never run seeds against production
if (env.NODE_ENV === 'production') {
  console.error('❌ Cannot run seed script in production');
  process.exit(1);
}

async function main() {
  const db = createClient(env.DATABASE_URL);

  console.log('🌱 Seeding development data...');

  // Demo user
  const [user] = await db
    .insert(users)
    .values({
      email: 'mox@dev.local',
      name: 'MOX',
      preferences: {
        theme: 'system',
        cursorColor: '#6366f1' as HexColor,
        showCursorsOfOthers: true,
        defaultBoardTool: 'select',
      },
    })
    .returning();
  if (!user) throw new Error('Failed to create demo user');
  console.log(`  ✓ Created user: ${user.email}`);

  // Demo workspace
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: 'Acme Inc',
      slug: 'acme',
      plan: 'pro',
    })
    .returning();
  if (!workspace) throw new Error('Failed to create demo workspace');
  console.log(`  ✓ Created workspace: ${workspace.name}`);

  // Membership
  await db.insert(memberships).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: 'owner',
  });
  console.log(`  ✓ Added user as owner of ${workspace.name}`);

  // Demo boards
  const boardTitles = ['Q1 Roadmap', 'System Architecture', 'Customer Journey Map'];

  for (const title of boardTitles) {
    const [board] = await db
      .insert(boards)
      .values({
        workspaceId: workspace.id,
        ownerId: user.id,
        title,
        visibility: 'workspace',
      })
      .returning();
    if (!board) throw new Error('Failed to create board');
    console.log(`  ✓ Created board: ${board.title}`);
  }

  console.log('🌱 Seed complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
