import { pgTable, text, timestamp, uuid, pgEnum, bigint, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const boardVisibilityEnum = pgEnum('board_visibility', [
  'private',
  'workspace',
  'public-link',
]);

export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    visibility: boardVisibilityEnum('visibility').notNull().default('workspace'),
    thumbnailUrl: text('thumbnail_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    workspaceIdx: index('boards_workspace_id_idx').on(table.workspaceId),
    ownerIdx: index('boards_owner_id_idx').on(table.ownerId),
    // Composite index for the dashboard query: "boards in my workspaces, not deleted"
    workspaceDeletedIdx: index('boards_workspace_id_deleted_at_idx').on(
      table.workspaceId,
      table.deletedAt,
    ),
  }),
);

export const boardVersions = pgTable(
  'board_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    label: text('label'),
    snapshotUrl: text('snapshot_url').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    boardIdx: index('board_versions_board_id_idx').on(table.boardId),
  }),
);

export const boardsRelations = relations(boards, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [boards.workspaceId],
    references: [workspaces.id],
  }),
  owner: one(users, {
    fields: [boards.ownerId],
    references: [users.id],
  }),
  versions: many(boardVersions),
}));

export const boardVersionsRelations = relations(boardVersions, ({ one }) => ({
  board: one(boards, {
    fields: [boardVersions.boardId],
    references: [boards.id],
  }),
  author: one(users, {
    fields: [boardVersions.authorId],
    references: [users.id],
  }),
}));

export type BoardRow = typeof boards.$inferSelect;
export type NewBoardRow = typeof boards.$inferInsert;
export type BoardVersionRow = typeof boardVersions.$inferSelect;
