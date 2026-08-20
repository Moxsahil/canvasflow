import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { boards } from './boards.js';
import { boardRoleEnum } from './board-access.js';

/**
 * A shareable link to one board.
 *
 * Modelled as a row rather than a signed token because the whole point of a
 * share link is that it can be taken back. A JWT carrying the same claims
 * would be unrevocable until expiry — "stop sharing this" has to mean *now*.
 *
 * Only the hash of the token is stored. The plaintext is returned once, at
 * creation, and never again: a leaked database dump must not hand out working
 * links to every board in the product.
 *
 * Redeeming a link writes a `board_members` row — deliberately not a
 * `memberships` row. Board access otherwise resolves by joining memberships on
 * workspace_id, so adding the invitee to the workspace would hand them every
 * other board in it. Sharing one board must share exactly one board.
 */
export const boardShareLinks = pgTable(
  'board_share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token. Never the token itself. */
    tokenHash: text('token_hash').notNull().unique(),
    /**
     * Granted on redemption. Only 'editor' or 'viewer' are meaningful here —
     * the enum is shared with board_members for column-type consistency, and
     * the mint endpoint rejects 'owner'.
     */
    role: boardRoleEnum('role').notNull().default('editor'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    /**
     * Whether someone without an account can open this link.
     *
     * This is the Excalidraw-style switch. Off, the link still works but sends
     * visitors through sign-in and grants access to their real account, which
     * is what an audited workspace usually wants. On, it behaves like an
     * Excalidraw room: anyone holding it can draw.
     */
    allowGuests: boolean('allow_guests').notNull().default(true),
    /** Null means no expiry. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Set on revoke. Checked live on every redemption, so it takes effect at once. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Null means unlimited. */
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    boardIdx: index('board_share_links_board_id_idx').on(table.boardId),
  }),
);

export const boardShareLinksRelations = relations(boardShareLinks, ({ one }) => ({
  board: one(boards, { fields: [boardShareLinks.boardId], references: [boards.id] }),
  creator: one(users, { fields: [boardShareLinks.createdBy], references: [users.id] }),
}));

export type BoardShareLinkRow = typeof boardShareLinks.$inferSelect;
export type NewBoardShareLinkRow = typeof boardShareLinks.$inferInsert;
