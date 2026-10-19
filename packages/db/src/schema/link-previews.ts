import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * What a web page says about itself — its title, a line of description, the
 * site's name and its picture — read once and kept for whoever asks next.
 *
 * Shared by every account rather than kept per board. The page is fetched
 * with no cookies and no sign-in, so what is read is what anyone on the web
 * would see, and there is nothing in it that one account may know and another
 * may not. Keyed by a hash of the address so the key has a fixed length
 * whatever was pasted.
 *
 * A page that could not be read is kept too, for less time, so a dead link
 * pasted on a busy board is not fetched again by every person who opens it.
 *
 * The picture is not in the row. Its bytes are in object storage under
 * `previews/{image_id}.{ext}`, where `image_id` is the hash of the bytes, so
 * two pages with the same picture share one object.
 */
export const linkPreviews = pgTable(
  'link_previews',
  {
    /** Lowercase hex SHA-256 of the address as it was normalised for fetching. */
    urlHash: text('url_hash').primaryKey(),
    url: text('url').notNull(),
    /** 'ok' when something was read; 'failed' when the page gave nothing usable. */
    status: text('status').notNull(),
    title: text('title'),
    description: text('description'),
    siteName: text('site_name'),
    /** The picture's object name, `{sha256}.{ext}`; null when the page has none. */
    image: text('image'),
    imageWidth: integer('image_width'),
    imageHeight: integer('image_height'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    /** Read again after this, the next time somebody asks. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    /** For clearing out what has long expired. */
    expiresAtIdx: index('link_previews_expires_at_idx').on(table.expiresAt),
  }),
);

export type LinkPreviewRow = typeof linkPreviews.$inferSelect;
export type NewLinkPreviewRow = typeof linkPreviews.$inferInsert;
