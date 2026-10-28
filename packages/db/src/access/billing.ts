import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { largerPlan, type BillingCycle, type WorkspacePlan } from '@canvasflow/types';
import type { Database } from '../client.js';
import {
  billingCheckouts,
  workspaceSubscriptions,
  type WorkspaceSubscriptionRow,
} from '../schema/billing.js';
import { workspaces } from '../schema/workspaces.js';

/**
 * Paid subscriptions, as copies of what the payment provider last said.
 *
 * Nothing here decides anything by itself. The provider says what state a
 * subscription is in; these functions keep the latest word, and work out from
 * all of a workspace's subscriptions which plan it has paid for.
 */

/**
 * The subscription states that still pay for a plan. `past_due` is included:
 * the provider is retrying the card, and the plan stays until it gives up and
 * says the subscription is over.
 */
export const PAYING_SUBSCRIPTION_STATUSES: readonly string[] = ['active', 'trialing', 'past_due'];

export function isPayingStatus(status: string): boolean {
  return PAYING_SUBSCRIPTION_STATUSES.includes(status);
}

export async function recordBillingCheckout(
  db: Database,
  input: {
    id: string;
    workspaceId: string;
    userId: string;
    plan: WorkspacePlan;
    cycle: BillingCycle;
  },
): Promise<void> {
  await db.insert(billingCheckouts).values(input).onConflictDoNothing();
}

/** A checkout we opened, or null for one we never did. */
export async function checkoutOf(
  db: Database,
  checkoutId: string,
): Promise<{ workspaceId: string; plan: WorkspacePlan } | null> {
  const [row] = await db
    .select({ workspaceId: billingCheckouts.workspaceId, plan: billingCheckouts.plan })
    .from(billingCheckouts)
    .where(eq(billingCheckouts.id, checkoutId));
  return row ?? null;
}

/** The workspace a checkout was opened for, or null for one we never opened. */
export async function workspaceOfCheckout(
  db: Database,
  checkoutId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ workspaceId: billingCheckouts.workspaceId })
    .from(billingCheckouts)
    .where(eq(billingCheckouts.id, checkoutId));
  return row?.workspaceId ?? null;
}

export interface SubscriptionSnapshot {
  id: string;
  workspaceId: string;
  customerId: string;
  plan: WorkspacePlan;
  cycle: BillingCycle;
  status: string;
  seats: number | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  endedAt: Date | null;
  /** The provider's timestamp for this snapshot. */
  sourceModifiedAt: Date;
}

/**
 * Keep this snapshot unless a newer one is already kept. Whether it was kept
 * is returned, though callers can recompute the plan either way: an older
 * snapshot changes nothing.
 */
export async function saveSubscriptionSnapshot(
  db: Database,
  snapshot: SubscriptionSnapshot,
): Promise<boolean> {
  const { id, ...fields } = snapshot;
  const rows = await db
    .insert(workspaceSubscriptions)
    .values(snapshot)
    .onConflictDoUpdate({
      target: workspaceSubscriptions.id,
      set: { ...fields, updatedAt: new Date() },
      where: sql`${workspaceSubscriptions.sourceModifiedAt} <= excluded.source_modified_at`,
    })
    .returning({ id: workspaceSubscriptions.id });
  return rows.length > 0 && rows[0]!.id === id;
}

/**
 * The largest plan a workspace's subscriptions still pay for, or null when
 * none do.
 */
export async function paidPlanOfWorkspace(
  db: Database,
  workspaceId: string,
): Promise<WorkspacePlan | null> {
  const rows = await db
    .select({ plan: workspaceSubscriptions.plan, status: workspaceSubscriptions.status })
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.workspaceId, workspaceId));
  let plan: WorkspacePlan | null = null;
  for (const row of rows) {
    if (!isPayingStatus(row.status)) continue;
    plan = plan ? largerPlan(plan, row.plan) : row.plan;
  }
  return plan;
}

/** The subscription paying for a workspace now, the most recently changed when there are several. */
export async function payingSubscriptionOf(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(workspaceSubscriptions)
    .where(
      and(
        eq(workspaceSubscriptions.workspaceId, workspaceId),
        inArray(workspaceSubscriptions.status, [...PAYING_SUBSCRIPTION_STATUSES]),
      ),
    )
    .orderBy(desc(workspaceSubscriptions.sourceModifiedAt))
    .limit(1);
  return row ?? null;
}

/** A workspace's name and plan, or null once it has been deleted. */
export async function workspaceNameAndPlan(
  db: Database,
  workspaceId: string,
): Promise<{ name: string; plan: WorkspacePlan } | null> {
  const [row] = await db
    .select({ name: workspaces.name, plan: workspaces.plan })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)));
  return row ?? null;
}

/** Every subscription a workspace has had, paying or not: whose orders are its invoices. */
export async function subscriptionIdsOf(db: Database, workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ id: workspaceSubscriptions.id })
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.workspaceId, workspaceId));
  return rows.map((row) => row.id);
}
