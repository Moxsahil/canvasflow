import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.env') });
import { PLAN_ALLOWANCES } from '@canvasflow/types';
import { parseEnv } from '../src/env.js';
import { createClient } from '../src/client.js';
import {
  findWorkspacesForPlan,
  parseSetPlanArgs,
  setWorkspacePlan,
  type PlanLookup,
} from '../src/access/plans.js';

/**
 * Move a workspace to another plan by hand — for somebody who paid outside
 * the app, a refund, or a plan given as a favour. A payment provider will make
 * the same change through the gateway once one is connected.
 *
 * Shows what it would do and changes nothing, unless given --confirm.
 *
 *   pnpm --filter @canvasflow/db plan:set pat@example.com team
 *   pnpm --filter @canvasflow/db plan:set pat@example.com team --confirm --note "UPI 20 Oct"
 *   pnpm --filter @canvasflow/db plan:set pat@example.com free --workspace <workspace id> --confirm
 *   pnpm --filter @canvasflow/db plan:set my-team-slug pro --confirm
 *
 * Works on whatever DATABASE_URL names: the development database from the
 * root .env, or production when it is passed explicitly. The first line it
 * prints says which.
 */

const USAGE =
  'Usage: pnpm --filter @canvasflow/db plan:set <owner email | workspace slug | workspace id> ' +
  '<free | team | pro | enterprise> [--confirm] [--workspace <workspace id>] [--note "<why>"]';

function describe(workspace: PlanLookup): string {
  return `"${workspace.name}" (${workspace.slug}, ${workspace.id}), owned by ${workspace.ownerEmail}, on ${workspace.plan}`;
}

async function main(): Promise<number> {
  const args = parseSetPlanArgs(process.argv.slice(2));
  if ('error' in args) {
    console.error(args.error);
    console.error(USAGE);
    return 1;
  }

  // With the development settings the database client prints every query,
  // which would bury this summary under SQL.
  process.env.NODE_ENV = 'production';
  const env = parseEnv();
  const db = createClient(env.DATABASE_URL);
  console.log(`Database: ${new URL(env.DATABASE_URL).host}`);

  const found = (await findWorkspacesForPlan(db, args.target)).filter(
    (workspace) => !args.workspaceId || workspace.id === args.workspaceId,
  );

  if (found.length === 0) {
    console.log(`No workspace matches ${args.target}.`);
    return 1;
  }
  if (found.length > 1) {
    console.log('That matches more than one workspace:');
    for (const workspace of found) console.log(`- ${describe(workspace)}`);
    console.log('Run again with --workspace and the id of the one you mean.');
    return 1;
  }

  const workspace = found[0]!;
  console.log(describe(workspace));
  if (workspace.plan === args.plan) {
    console.log(`It is already on ${args.plan}. Nothing to do.`);
    return 0;
  }
  const allowance = PLAN_ALLOWANCES[args.plan];
  console.log(
    `Move to: ${args.plan} (${allowance.diagramsPerMonth} diagrams a month per person)` +
      (args.note ? `, note "${args.note}"` : ''),
  );

  if (!args.confirm) {
    console.log('Nothing has changed. Run the same command with --confirm to move it.');
    return 0;
  }

  const outcome = await setWorkspacePlan(db, {
    workspaceId: workspace.id,
    plan: args.plan,
    source: 'operator',
    ...(args.note ? { note: args.note } : {}),
  });
  if (!outcome.ok) {
    console.error('Not changed: the workspace was deleted in the meantime.');
    return 1;
  }

  console.log(
    `Done: ${outcome.from} → ${outcome.to}. Open editors pick it up the next time they read the workspace.`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('Failed to change the plan:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
