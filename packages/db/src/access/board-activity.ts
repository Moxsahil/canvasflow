import { DEFAULT_NOTIFICATION_SETTINGS } from '@canvasflow/types';
import { and, asc, eq, exists, gt, gte, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { accountDeletions } from '../schema/account-deletion.js';
import { boardActivity } from '../schema/board-activity.js';
import { boardMembers } from '../schema/board-access.js';
import { boards } from '../schema/boards.js';
import { users } from '../schema/users.js';
import { memberships } from '../schema/workspaces.js';

/** Changes one person made to one board, counted since the last time they were added up. */
export interface ActivityCount {
  boardId: string;
  userId: string;
  changes: number;
}

/** A UTC day as the `day` column holds it: `2026-10-13`. */
export function activityDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Add these counts to the day they were made on. One statement however many
 * there are; a count for a board or person that has since gone is dropped
 * rather than failing the rest.
 */
export async function recordBoardActivity(
  db: Database,
  counts: readonly ActivityCount[],
  at: Date = new Date(),
): Promise<void> {
  if (counts.length === 0) return;
  const day = activityDay(at);
  await db
    .insert(boardActivity)
    .select(
      db
        .select({
          boardId: boards.id,
          userId: users.id,
          day: sql<string>`${day}::date`.as('day'),
          changes: sql<number>`v.changes`.as('changes'),
          lastAt: sql<Date>`${at.toISOString()}::timestamptz`.as('last_at'),
        })
        .from(
          sql`(values ${sql.join(
            counts.map((c) => sql`(${c.boardId}::uuid, ${c.userId}::uuid, ${c.changes}::int)`),
            sql`, `,
          )}) as v(board_id, user_id, changes)`,
        )
        .innerJoin(boards, sql`${boards.id} = v.board_id`)
        .innerJoin(users, sql`${users.id} = v.user_id`),
    )
    .onConflictDoUpdate({
      target: [boardActivity.boardId, boardActivity.userId, boardActivity.day],
      set: {
        changes: sql`${boardActivity.changes} + excluded.changes`,
        lastAt: sql`excluded.last_at`,
      },
    });
}

/** Forget activity from before `day`. Answers how many rows went. */
export async function pruneBoardActivity(db: Database, day: string): Promise<number> {
  const gone = await db
    .delete(boardActivity)
    .where(lt(boardActivity.day, day))
    .returning({ boardId: boardActivity.boardId });
  return gone.length;
}

/** Somebody a digest may go to. */
export interface DigestRecipient {
  id: string;
  name: string;
  email: string;
}

/**
 * The next people, after `after` in id order, who want the weekly digest and
 * can be written to: an account with a confirmed address, in use, not on its
 * way to being deleted. Read in pages, so a run never holds everyone at once.
 */
export async function digestRecipients(
  db: Database,
  page: { after: string | null; limit: number },
): Promise<DigestRecipient[]> {
  // The switch as stored, or its default for anyone who never chose.
  const wants = sql`coalesce((${users.preferences} -> 'notifications' ->> 'weeklyDigest')::boolean, ${DEFAULT_NOTIFICATION_SETTINGS.weeklyDigest})`;
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .leftJoin(
      accountDeletions,
      and(eq(accountDeletions.userId, users.id), eq(accountDeletions.status, 'scheduled')),
    )
    .where(
      and(
        eq(users.isGuest, false),
        isNotNull(users.emailVerifiedAt),
        isNull(users.disabledAt),
        isNull(accountDeletions.id),
        wants,
        page.after ? gt(users.id, page.after) : undefined,
      ),
    )
    .orderBy(asc(users.id))
    .limit(page.limit);
}

/** One board's week, as the digest lists it. */
export interface BoardWeek {
  boardId: string;
  title: string;
  /** Who changed it, busiest first. Never the reader. */
  people: string[];
  /** The last day anybody did, `2026-10-13`. */
  lastDay: string;
  changes: number;
}

/**
 * The boards this person can open that somebody else changed since `since`,
 * the most recently changed first. Access is decided as `resolveBoardAccess`
 * decides it: their own, a grant that stands, or their workspace's — unless
 * they were removed from that board.
 */
export async function weekOfBoardsFor(
  db: Database,
  userId: string,
  since: string,
): Promise<BoardWeek[]> {
  const rows = await db
    .select({
      boardId: boards.id,
      title: boards.title,
      name: users.name,
      lastDay: sql<string>`max(${boardActivity.day})::text`,
      changes: sql<number>`sum(${boardActivity.changes})::int`,
    })
    .from(boardActivity)
    .innerJoin(boards, and(eq(boards.id, boardActivity.boardId), isNull(boards.deletedAt)))
    .innerJoin(users, eq(users.id, boardActivity.userId))
    .leftJoin(
      boardMembers,
      and(eq(boardMembers.boardId, boards.id), eq(boardMembers.userId, userId)),
    )
    .where(
      and(
        gte(boardActivity.day, since),
        ne(boardActivity.userId, userId),
        or(
          eq(boards.ownerId, userId),
          eq(boardMembers.status, 'active'),
          and(
            isNull(boardMembers.id),
            exists(
              db
                .select({ one: sql`1` })
                .from(memberships)
                .where(
                  and(
                    eq(memberships.workspaceId, boards.workspaceId),
                    eq(memberships.userId, userId),
                  ),
                ),
            ),
          ),
        ),
      ),
    )
    .groupBy(boards.id, boards.title, boardActivity.userId, users.name);

  const byBoard = new Map<string, BoardWeek & { busy: Map<string, number> }>();
  for (const row of rows) {
    const week = byBoard.get(row.boardId) ?? {
      boardId: row.boardId,
      title: row.title,
      people: [],
      lastDay: row.lastDay,
      changes: 0,
      busy: new Map<string, number>(),
    };
    week.changes += row.changes;
    if (row.lastDay > week.lastDay) week.lastDay = row.lastDay;
    week.busy.set(row.name, (week.busy.get(row.name) ?? 0) + row.changes);
    byBoard.set(row.boardId, week);
  }

  return [...byBoard.values()]
    .map(({ busy, ...week }) => ({
      ...week,
      people: [...busy.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    }))
    .sort((a, b) =>
      a.lastDay === b.lastDay ? b.changes - a.changes : a.lastDay < b.lastDay ? 1 : -1,
    );
}
