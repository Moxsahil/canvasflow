import { notificationSettingsFrom, type NotificationSettings } from '@canvasflow/types';
import { and, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { accountDeletions } from '../schema/account-deletion.js';
import { boards } from '../schema/boards.js';
import { notificationDeliveries } from '../schema/notifications.js';
import { users } from '../schema/users.js';

export type NotificationDeliveryKind =
  | 'comment-mention'
  | 'board-joined'
  | 'workspace-joined'
  | 'access-changed';

/** Where something happened: on a board, or across a workspace. */
export type NotificationScope = { boardId: string } | { workspaceId: string };

/** Somebody who might be emailed, with everything that decides whether they are. */
export interface NotificationRecipient {
  id: string;
  name: string;
  email: string;
  isGuest: boolean;
  /** Only a confirmed address is written to. */
  emailVerified: boolean;
  /** Barred from signing in. */
  disabled: boolean;
  /** Asked to be deleted, and still in the grace period: locked, and not written to. */
  deletionScheduled: boolean;
  settings: NotificationSettings;
}

/** These people as the email decision needs them. Unknown ids are left out. */
export async function notificationRecipients(
  db: Database,
  userIds: readonly string[],
): Promise<NotificationRecipient[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      isGuest: users.isGuest,
      emailVerifiedAt: users.emailVerifiedAt,
      disabledAt: users.disabledAt,
      preferences: users.preferences,
      deletionId: accountDeletions.id,
    })
    .from(users)
    .leftJoin(
      accountDeletions,
      and(eq(accountDeletions.userId, users.id), eq(accountDeletions.status, 'scheduled')),
    )
    .where(inArray(users.id, [...userIds]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    isGuest: row.isGuest,
    emailVerified: row.emailVerifiedAt !== null,
    disabled: row.disabledAt !== null,
    deletionScheduled: row.deletionId !== null,
    settings: notificationSettingsFrom(row.preferences.notifications),
  }));
}

/** A board's name, or null when it is gone. */
export async function liveBoardTitle(db: Database, boardId: string): Promise<string | null> {
  const [row] = await db
    .select({ title: boards.title })
    .from(boards)
    .where(and(eq(boards.id, boardId), isNull(boards.deletedAt)))
    .limit(1);
  return row?.title ?? null;
}

export type NewDelivery = {
  recipientId: string;
  kind: NotificationDeliveryKind;
  sourceId: string;
  actorId: string | null;
} & NotificationScope;

/**
 * Record that these people are being told, and answer with the ones that had
 * not been already — the only ones anything should be sent to. The unique key
 * settles a race between two reports of the same comment.
 */
export async function recordDeliveries(
  db: Database,
  deliveries: readonly NewDelivery[],
): Promise<{ id: string; recipientId: string }[]> {
  if (deliveries.length === 0) return [];
  return db
    .insert(notificationDeliveries)
    .values(
      deliveries.map(({ recipientId, kind, sourceId, actorId, ...scope }) => ({
        recipientId,
        kind,
        sourceId,
        actorId,
        ...('boardId' in scope ? { boardId: scope.boardId } : { workspaceId: scope.workspaceId }),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notificationDeliveries.id, recipientId: notificationDeliveries.recipientId });
}

/**
 * Whether this person was emailed about something here since `since` — about
 * anything on the board, or only about one kind of thing when `kind` is given.
 */
export async function emailedSince(
  db: Database,
  input: { recipientId: string; kind?: NotificationDeliveryKind } & NotificationScope,
  since: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, input.recipientId),
        'boardId' in input
          ? eq(notificationDeliveries.boardId, input.boardId)
          : and(
              eq(notificationDeliveries.workspaceId, input.workspaceId),
              isNull(notificationDeliveries.boardId),
            ),
        input.kind ? eq(notificationDeliveries.kind, input.kind) : undefined,
        isNotNull(notificationDeliveries.emailedAt),
        gte(notificationDeliveries.emailedAt, since),
      ),
    )
    .limit(1);
  return row !== undefined;
}

export async function markDeliveryEmailed(
  db: Database,
  deliveryId: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .update(notificationDeliveries)
    .set({ emailedAt: at })
    .where(eq(notificationDeliveries.id, deliveryId));
}
