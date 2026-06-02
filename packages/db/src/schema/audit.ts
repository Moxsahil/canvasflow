import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import type { AuditAction } from '@canvasflow/types';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').$type<AuditAction>().notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('audit_log_workspace_id_idx').on(table.workspaceId),
    actorIdx: index('audit_log_actor_id_idx').on(table.actorId),
    createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt),
  }),
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
