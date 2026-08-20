import { pgTable, uuid, pgEnum, timestamp, unique, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { boards } from './boards.js';

/**
 * Board-level roles, distinct from workspace roles (workspaceRoleEnum).
 *
 *   owner  — full control: edit, manage members, approve/reject requests,
 *            revoke access, delete the board.
 *   editor — read + all document mutations + collaborate. Cannot manage
 *            membership or delete the board.
 *   viewer — read and see presence. Cannot mutate document state.
 */
export const boardRoleEnum = pgEnum('board_role', ['owner', 'editor', 'viewer']);

export const boardMemberStatusEnum = pgEnum('board_member_status', ['active', 'revoked']);

export const boardAccessRequestStatusEnum = pgEnum('board_access_request_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
]);

/**
 * Explicit per-board membership — the authoritative answer to "is this
 * user allowed on this board, and in what capacity?".
 *
 * Before this table, board access was implied by workspace membership
 * alone, which meant anyone in the workspace silently had full access to
 * every board in it and there was no way to grant a specific outsider
 * access to a single board. Membership is now its own record so it can be
 * granted, scoped by role, and revoked independently.
 *
 * Revocation is a status change rather than a row delete, so the history
 * of who was granted what survives an audit.
 */
export const boardMembers = pgTable(
  'board_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: boardRoleEnum('role').notNull().default('editor'),
    status: boardMemberStatusEnum('status').notNull().default('active'),
    /** Who granted this membership (null for the board's original owner row). */
    grantedBy: uuid('granted_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One membership row per (board, user) — grants update in place rather
    // than accumulating duplicates, which also makes the authorization
    // lookup a single indexed row read.
    uniqueMember: unique('board_members_board_user_unique').on(table.boardId, table.userId),
    boardIdx: index('board_members_board_id_idx').on(table.boardId),
    userIdx: index('board_members_user_id_idx').on(table.userId),
  }),
);

/**
 * A request from a non-member to be let onto a board, and the owner's
 * decision on it.
 *
 * Deliberately separate from boardMembers: a request is a conversation
 * ("may I?" / "yes"), while membership is the resulting authorization.
 * Keeping them apart means a rejected or pending request grants nothing
 * by construction — there is no state in which the request table alone
 * could be mistaken for permission.
 */
export const boardAccessRequests = pgTable(
  'board_access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: boardAccessRequestStatusEnum('status').notNull().default('pending'),
    /** Which role the requester is asking for; owners may downgrade on approval. */
    requestedRole: boardRoleEnum('requested_role').notNull().default('editor'),
    respondedBy: uuid('responded_by').references(() => users.id),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    boardIdx: index('board_access_requests_board_id_idx').on(table.boardId),
    requesterIdx: index('board_access_requests_requester_id_idx').on(table.requesterId),
    // The owner's inbox query: pending requests for a board.
    boardStatusIdx: index('board_access_requests_board_id_status_idx').on(
      table.boardId,
      table.status,
    ),
  }),
);

export const boardMembersRelations = relations(boardMembers, ({ one }) => ({
  board: one(boards, { fields: [boardMembers.boardId], references: [boards.id] }),
  user: one(users, { fields: [boardMembers.userId], references: [users.id] }),
}));

export const boardAccessRequestsRelations = relations(boardAccessRequests, ({ one }) => ({
  board: one(boards, { fields: [boardAccessRequests.boardId], references: [boards.id] }),
  requester: one(users, { fields: [boardAccessRequests.requesterId], references: [users.id] }),
}));

export type BoardRole = (typeof boardRoleEnum.enumValues)[number];
export type BoardMemberRow = typeof boardMembers.$inferSelect;
export type NewBoardMemberRow = typeof boardMembers.$inferInsert;
export type BoardAccessRequestRow = typeof boardAccessRequests.$inferSelect;
export type NewBoardAccessRequestRow = typeof boardAccessRequests.$inferInsert;
