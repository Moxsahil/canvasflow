import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  linkPreviews,
  type LinkPreviewRow,
  type NewLinkPreviewRow,
} from '../schema/link-previews.js';

/** The kept preview of one address, expired or not; null when it was never read. */
export async function getLinkPreview(
  db: Database,
  urlHash: string,
): Promise<LinkPreviewRow | null> {
  const [row] = await db.select().from(linkPreviews).where(eq(linkPreviews.urlHash, urlHash));
  return row ?? null;
}

/**
 * Keep what was read for an address, over whatever was kept for it before.
 *
 * One statement either way: reading a page again after its preview expired is
 * the common case, and the address is the key.
 */
export async function saveLinkPreview(db: Database, row: NewLinkPreviewRow): Promise<void> {
  const { urlHash, ...rest } = row;
  await db
    .insert(linkPreviews)
    .values(row)
    .onConflictDoUpdate({ target: linkPreviews.urlHash, set: { ...rest, urlHash } });
}
