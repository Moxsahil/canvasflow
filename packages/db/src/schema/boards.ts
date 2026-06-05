import { pgEnum, pgTable, text, uuid, timestamp, bigint } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces.js';
import { users } from './users.js';
import { relations } from 'drizzle-orm';

export const boardVisibilityEnum = pgEnum('baord_visibility', [
  'private',
  'workspace',
  'public-link',
]);

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('text').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),
  visibility: boardVisibilityEnum('visibility').notNull().default('workspace'),
  thumbnailUrl: text('thumbnail_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const boardVersions = pgTable('board_versions', {
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
});

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
