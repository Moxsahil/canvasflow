import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { aiUsage } from '../schema/ai-usage.js';

/**
 * Counting generated diagrams against a monthly allowance.
 *
 * A diagram is counted when it starts, not when it finishes, so two requests
 * sent together cannot both slip under the limit; one that produces nothing
 * is given back with `refundDiagram`. Months are calendar months in UTC, so
 * everyone's allowance renews at the same moment.
 */

/** The month `now` falls in, as its first day: `2026-10-01`. */
export function usageMonth(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/** When the month `now` falls in ends, and a fresh allowance starts. */
export function nextUsageMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export type ReserveOutcome =
  | { ok: true; month: string; used: number }
  | { ok: false; month: string; used: number };

/**
 * Count a diagram for this person this month — `cost` of them for a detailed
 * one — if that stays within `limit`.
 *
 * One statement: the row is created at the cost, or raised by it only while
 * the total stays within the limit. Two requests racing for the last diagrams
 * of the month both run it, and only one gets a row back.
 */
export async function reserveDiagram(
  db: Database,
  input: { userId: string; limit: number; now: Date; cost?: number },
): Promise<ReserveOutcome> {
  const month = usageMonth(input.now);
  const cost = Math.max(1, Math.floor(input.cost ?? 1));
  if (input.limit < cost) {
    return { ok: false, month, used: await diagramsUsedIn(db, input.userId, month) };
  }

  const [row] = await db
    .insert(aiUsage)
    .values({ userId: input.userId, month, diagrams: cost, updatedAt: input.now })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.month],
      set: { diagrams: sql`${aiUsage.diagrams} + ${cost}`, updatedAt: input.now },
      setWhere: sql`${aiUsage.diagrams} + ${cost} <= ${input.limit}`,
    })
    .returning({ diagrams: aiUsage.diagrams });

  if (row) return { ok: true, month, used: row.diagrams };
  return { ok: false, month, used: await diagramsUsedIn(db, input.userId, month) };
}

/**
 * Give back a diagram that produced nothing — or `cost` of them, for a
 * detailed one.
 *
 * Named by the month it was counted in rather than today's, so a diagram that
 * fails across midnight at the end of a month is returned to the right one.
 */
export async function refundDiagram(
  db: Database,
  input: { userId: string; month: string; cost?: number },
): Promise<void> {
  const cost = Math.max(1, Math.floor(input.cost ?? 1));
  await db
    .update(aiUsage)
    .set({ diagrams: sql`greatest(${aiUsage.diagrams} - ${cost}, 0)`, updatedAt: new Date() })
    .where(and(eq(aiUsage.userId, input.userId), eq(aiUsage.month, input.month)));
}

/** How many diagrams this person has generated in the month `now` falls in. */
export async function diagramsUsed(db: Database, userId: string, now: Date): Promise<number> {
  return diagramsUsedIn(db, userId, usageMonth(now));
}

async function diagramsUsedIn(db: Database, userId: string, month: string): Promise<number> {
  const [row] = await db
    .select({ diagrams: aiUsage.diagrams })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.month, month)));
  return row?.diagrams ?? 0;
}
