import { boolean, jsonb, pgTable, uuid, timestamp, text } from 'drizzle-orm/pg-core';
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from '@canvasflow/types';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * Guests get a synthetic address (`guest-<id>@guests.invalid`) because this
   * column is unique and not null. It is never delivered to.
   */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  /**
   * Someone who arrived through a share link without an account.
   *
   * They get a real row rather than a special case because `board_updates`,
   * `audit_log` and `board_grants` all reference `users.id` — a guest without
   * one could sync to peers in memory but would fail every persistence write.
   * The flag is what lets sign-in, listings and cleanup tell them apart.
   */
  isGuest: boolean('is_guest').notNull().default(false),
  /**
   * A photo from whoever they signed in with, when there is one.
   *
   * Someone else's URL on someone else's origin, which is why an uploaded
   * photo does not go here: those live in our own object storage and are named
   * by the two columns below.
   */
  avatarUrl: text('avatar_url'),
  /**
   * The sha256 of an uploaded photo, which is also its object key under
   * `avatars/<user id>/`. Null for anyone who has not uploaded one.
   */
  avatarFileId: text('avatar_file_id'),
  /** Pinned into the signature of every URL issued for that object. */
  avatarMimeType: text('avatar_mime_type'),
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
