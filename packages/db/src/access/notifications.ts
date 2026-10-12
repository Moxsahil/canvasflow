import { notificationSettingsFrom, type NotificationSettings } from '@canvasflow/types';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { users } from '../schema/users.js';

/**
 * An account's email switches, or why there are none to show: no such
 * account, or a guest, who has no address to write to.
 */
export type NotificationSettingsRead =
  | { ok: true; settings: NotificationSettings }
  | { ok: false; reason: 'no-account' | 'guest' };

export async function getNotificationSettings(
  db: Database,
  userId: string,
): Promise<NotificationSettingsRead> {
  const [row] = await db
    .select({ isGuest: users.isGuest, preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return { ok: false, reason: 'no-account' };
  if (row.isGuest) return { ok: false, reason: 'guest' };
  return { ok: true, settings: notificationSettingsFrom(row.preferences.notifications) };
}

/**
 * Flip some switches and answer with all of them as they now stand.
 *
 * Merged into what is stored inside the one statement, a switch at a time, so
 * two tabs flipping different switches at once both keep theirs: neither
 * writes back a copy of the other's switch that it read before the change.
 * Refuses a guest in the same statement.
 */
export async function updateNotificationSettings(
  db: Database,
  userId: string,
  changes: Partial<NotificationSettings>,
): Promise<NotificationSettingsRead> {
  const [row] = await db
    .update(users)
    .set({
      preferences: sql`jsonb_set(
        ${users.preferences},
        '{notifications}',
        coalesce(${users.preferences} -> 'notifications', '{}'::jsonb) || ${JSON.stringify(changes)}::jsonb
      )`,
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), eq(users.isGuest, false)))
    .returning({ preferences: users.preferences });

  if (row) return { ok: true, settings: notificationSettingsFrom(row.preferences.notifications) };

  // Nothing was written: only this rare path pays for the read that says why.
  const [account] = await db
    .select({ isGuest: users.isGuest })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { ok: false, reason: account?.isGuest ? 'guest' : 'no-account' };
}
