import { jsonb, pgTable, uuid, timestamp, text } from 'drizzle-orm/pg-core';
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from '@canvasflow/types';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  passwordHash: text('password_hash'),
  emailVerifiedAt: timestamp('email_verified_at', {
    withTimezone: true,
  }),
  preferences: jsonb('preferences')
    .$type<UserPreferences>()
    .notNull()
    .default(DEFAULT_USER_PREFERENCES),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
