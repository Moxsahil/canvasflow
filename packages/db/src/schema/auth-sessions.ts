import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

/**
 * One signed-in session, held server side so it can be taken away.
 *
 * Named `auth_sessions` rather than `sessions` because the Auth.js adapter
 * already owns a table by that name. The two are unrelated: this one belongs
 * to the gateway and outlives the adapter.
 *
 * The point of a row is revocation. A self-contained token cannot be withdrawn
 * before it expires, which is why signing out today clears a cookie and
 * nothing more. With a record, sign-out means marking this revoked, and the
 * next attempt to use it fails wherever it is being held.
 *
 * Holds no token of its own. Every refresh token this session has ever issued
 * is a row in `auth_session_tokens`, because rotation means there is a series
 * of them and the spent ones have to stay recognisable — see that table.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * When the session stops being renewable. Compared against the server
     * clock, never against anything the holder sends.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /**
     * Stamped when the session is used to mint a new access token. Null until
     * the first refresh, which is what tells an idle session from a live one
     * when somebody is looking at their own device list.
     */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    /**
     * Set on sign-out, or when a session is taken away from elsewhere. A
     * timestamp rather than a delete, so the history survives an audit and a
     * revoked session can be told apart from one that never existed.
     */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /**
     * When this session was rescued from a refresh token that was spent but
     * never arrived — a dropped response, or a machine that lost power before
     * the browser wrote the cookie down.
     *
     * Recorded because the rescue may happen once. Two parties alternately
     * presenting stale tokens would otherwise hand the session back and forth
     * forever, each rescue looking exactly like the last; a session that needs
     * rescuing twice is ended instead.
     */
    recoveredAt: timestamp('recovered_at', { withTimezone: true }),
    /**
     * What the browser called itself when the session began. For showing
     * somebody their own sessions, not for deciding anything: a caller writes
     * this header and can write anything in it.
     */
    userAgent: text('user_agent'),
    /**
     * Roughly where the session began — "New Delhi, Delhi, India" — from the
     * edge's location headers at sign-in. For showing somebody their own
     * sessions so they can spot one that is not theirs; never used to decide
     * anything. Null when the edge said nothing: sessions from before this was
     * recorded, local development, and any request that did not come through
     * the edge.
     */
    location: text('location'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Listing or revoking everything belonging to one account. */
    userIdx: index('auth_sessions_user_id_idx').on(table.userId),
    /** Sweeping sessions nobody came back for. */
    expiresIdx: index('auth_sessions_expires_at_idx').on(table.expiresAt),
  }),
);

/**
 * Every refresh token a session has ever issued, spent and unspent.
 *
 * A row per token rather than one column on the session, because rotation
 * replaces the token on each use and the replaced ones have to stay
 * recognisable. Without them a token that was rotated away simply would not be
 * found, which is indistinguishable from one that was invented — and that
 * distinction is the entire point.
 *
 * Presenting a token whose `used_at` is already set means the same credential
 * was spent twice. The legitimate holder cannot do that, because their copy
 * was replaced the first time; somebody who copied the token can. So the
 * session it belongs to is ended, which takes the thief and the victim off it
 * together. That is the intended outcome: better a sign-in than a stranger
 * holding a live session.
 *
 * Rows are kept after use rather than deleted. A deleted row cannot be
 * recognised, and recognising it is the whole mechanism.
 */
export const authSessionTokens = pgTable(
  'auth_session_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id, { onDelete: 'cascade' }),
    /** SHA-256 of the refresh token. Never the token itself. */
    tokenHash: text('token_hash').notNull().unique(),
    /**
     * When this token was exchanged for its successor. Null while it is the
     * live one. Set exactly once, by a conditional update, so two requests
     * racing with the same token cannot both be served.
     */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** Walking or revoking a whole chain. */
    sessionIdx: index('auth_session_tokens_session_id_idx').on(table.sessionId),
  }),
);

export const authSessionsRelations = relations(authSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
  tokens: many(authSessionTokens),
}));

export const authSessionTokensRelations = relations(authSessionTokens, ({ one }) => ({
  session: one(authSessions, {
    fields: [authSessionTokens.sessionId],
    references: [authSessions.id],
  }),
}));

export type AuthSessionRow = typeof authSessions.$inferSelect;
export type NewAuthSessionRow = typeof authSessions.$inferInsert;
export type AuthSessionTokenRow = typeof authSessionTokens.$inferSelect;
