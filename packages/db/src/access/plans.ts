import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { isWorkspacePlan, type WorkspacePlan } from '@canvasflow/types';
import type { Database } from '../client.js';
import { auditLog } from '../schema/audit.js';
import { users } from '../schema/users.js';
import { memberships, workspaces } from '../schema/workspaces.js';

/**
 * Moving a workspace between plans.
 *
 * The one way a plan changes, whoever asks: an operator from the command line
 * today, a payment provider's confirmation later. Each change is written to
 * the audit log in the same transaction, so a workspace's billing history can
 * be read back without trusting anything outside the database.
 */

/** Who asked for the change, kept on its audit row. */
export type PlanChangeSource = 'operator' | 'billing';

export type SetPlanOutcome =
  | { ok: true; changed: boolean; from: WorkspacePlan; to: WorkspacePlan }
  | { ok: false; reason: 'workspace-gone' };

export async function setWorkspacePlan(
  db: Database,
  input: { workspaceId: string; plan: WorkspacePlan; source: PlanChangeSource; note?: string },
): Promise<SetPlanOutcome> {
  return db.transaction(async (tx) => {
    // Locked, so two changes to one workspace land one after the other and
    // each audit row's "from" is the plan it actually replaced.
    const [row] = await tx
      .select({ plan: workspaces.plan })
      .from(workspaces)
      .where(and(eq(workspaces.id, input.workspaceId), isNull(workspaces.deletedAt)))
      .for('update');
    if (!row) return { ok: false, reason: 'workspace-gone' } as const;

    const from = row.plan;
    if (from === input.plan) return { ok: true, changed: false, from, to: input.plan } as const;

    await tx
      .update(workspaces)
      .set({ plan: input.plan, updatedAt: new Date() })
      .where(eq(workspaces.id, input.workspaceId));

    await tx.insert(auditLog).values({
      workspaceId: input.workspaceId,
      actorId: null,
      action: 'workspace.plan.changed',
      targetType: 'workspace',
      targetId: input.workspaceId,
      metadata: {
        from,
        to: input.plan,
        source: input.source,
        ...(input.note ? { note: input.note } : {}),
      },
    });
    return { ok: true, changed: true, from, to: input.plan } as const;
  });
}

/**
 * The plan a workspace is on; Free for one that no longer exists, so whatever
 * asks is held to the smallest allowance rather than refused outright.
 */
export async function workspacePlan(db: Database, workspaceId: string): Promise<WorkspacePlan> {
  const [row] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)));
  return row?.plan ?? 'free';
}

export interface PlanLookup {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: WorkspacePlan;
  readonly ownerEmail: string;
}

/**
 * The workspaces a command-line target could mean: the workspace with that id
 * or slug, or every workspace owned by that address. Deleted ones are left out.
 */
export async function findWorkspacesForPlan(db: Database, target: string): Promise<PlanLookup[]> {
  const match = target.includes('@')
    ? sql`lower(${users.email}) = ${target.trim().toLowerCase()}`
    : UUID.test(target)
      ? or(eq(workspaces.id, target), eq(workspaces.slug, target))
      : eq(workspaces.slug, target);

  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      ownerEmail: users.email,
    })
    .from(workspaces)
    .innerJoin(
      memberships,
      and(eq(memberships.workspaceId, workspaces.id), eq(memberships.role, 'owner')),
    )
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(match, isNull(workspaces.deletedAt)))
    .orderBy(workspaces.createdAt);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SetPlanArgs {
  /** A workspace id, a workspace slug, or the owner's email address. */
  readonly target: string;
  readonly plan: WorkspacePlan;
  readonly confirm: boolean;
  /** Narrows an owner's address down to one of their workspaces. */
  readonly workspaceId?: string;
  /** Why, in the operator's words — a payment reference, say. Kept on the audit row. */
  readonly note?: string;
}

export function parseSetPlanArgs(argv: readonly string[]): SetPlanArgs | { error: string } {
  const positional: string[] = [];
  let confirm = false;
  let workspaceId: string | undefined;
  let note: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg === '--confirm') {
      confirm = true;
    } else if (arg === '--workspace') {
      workspaceId = argv[i + 1];
      i += 1;
      if (!workspaceId || !UUID.test(workspaceId)) {
        return { error: '--workspace needs a workspace id.' };
      }
    } else if (arg === '--note') {
      note = argv[i + 1]?.trim();
      i += 1;
      if (!note) return { error: '--note needs some words.' };
    } else if (arg.startsWith('-')) {
      return { error: `Unknown option ${arg}.` };
    } else {
      positional.push(arg.trim());
    }
  }

  if (positional.length !== 2 || !positional[0]) {
    return { error: 'Give a workspace (id, slug or owner email) and a plan.' };
  }
  const [target, plan] = positional as [string, string];
  if (!isWorkspacePlan(plan)) {
    return { error: `Unknown plan "${plan}"; expected free, team, pro or enterprise.` };
  }
  return {
    target,
    plan,
    confirm,
    ...(workspaceId ? { workspaceId } : {}),
    ...(note ? { note } : {}),
  };
}
