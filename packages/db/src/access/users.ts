import { isCursorColor, type CursorColor } from '@canvasflow/types';
import { users, type UserRow } from '../schema/users.js';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';

export interface Profile {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  cursorColor: CursorColor | null;
  /**
   * Changes whenever the photo does, and null when there is none.
   *
   * Deliberately not a URL. A stored photo is read through a short-lived signed
   * URL that only the API can mint, so this token is what travels instead — to
   * the editor, and between collaborators — and the URL is fetched against it.
   * It doubles as a cache key: a photo cannot change while this does not.
   */
  avatarVersion: string | null;
  /**
   * Whether the photo is one they uploaded here.
   *
   * False covers both "no photo" and "only what a sign-in provider gave us" —
   * a distinction the board cares about, because only a photo somebody chose is
   * worth putting on a cursor.
   */
  avatarUploaded: boolean;
}

/** The stored photo itself, for the one caller that turns it into a URL. */
export interface AvatarSource {
  fileId: string | null;
  mimeType: string | null;
  /** Whoever they signed in with gave us this. Used when nothing was uploaded. */
  externalUrl: string | null;
}

export interface ProfileChanges {
  name?: string;
  cursorColor?: CursorColor | null;
}

const PROFILE_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  avatarFileId: users.avatarFileId,
  isGuest: users.isGuest,
  preferences: users.preferences,
};

type ProfileRow = Pick<UserRow, keyof typeof PROFILE_COLUMNS>;

/**
 * A token that changes with the photo and says nothing about it.
 *
 * An uploaded photo is content-addressed, so a prefix of its id already changes
 * whenever the bytes do. A provider's photo has no such id and cannot change
 * without them re-issuing it, so one constant covers it.
 */
function avatarVersionOf(row: Pick<ProfileRow, 'avatarFileId' | 'avatarUrl'>): string | null {
  if (row.avatarFileId) return row.avatarFileId.slice(0, 16);
  return row.avatarUrl ? 'provider' : null;
}

function toProfile(row: ProfileRow): Profile {
  const color = row.preferences.cursorColor;
  return {
    id: row.id,
    name: row.name,
    email: row.isGuest ? null : row.email,
    avatarUrl: row.avatarUrl,
    isGuest: row.isGuest,
    cursorColor: isCursorColor(color) ? color : null,
    avatarVersion: avatarVersionOf(row),
    // A photo they chose here, as against one a sign-in provider handed us.
    // The board shows only the first kind: a provider's generated letter-avatar
    // is not a picture of anyone, and drawing it beside a cursor would say less
    // than the initial it replaced.
    avatarUploaded: row.avatarFileId !== null,
  };
}

export async function getProfile(db: Database, userId: string): Promise<Profile | null> {
  const [row] = await db.select(PROFILE_COLUMNS).from(users).where(eq(users.id, userId)).limit(1);
  return row ? toProfile(row) : null;
}

export async function updateProfile(
  db: Database,
  userId: string,
  changes: ProfileChanges,
): Promise<Profile | null> {
  const [row] = await db
    .update(users)
    .set({
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.cursorColor !== undefined
        ? {
            preferences: sql`${users.preferences} || ${JSON.stringify({
              cursorColor: changes.cursorColor,
            })} :: jsonb`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning(PROFILE_COLUMNS);

  return row ? toProfile(row) : null;
}

/** What a photo is stored as, for the caller that signs a URL for it. */
export async function getAvatarSource(db: Database, userId: string): Promise<AvatarSource | null> {
  const [row] = await db
    .select({
      fileId: users.avatarFileId,
      mimeType: users.avatarMimeType,
      externalUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ?? null;
}

/**
 * Point someone's profile at an uploaded photo.
 *
 * Returns the file id it replaced, so the caller can remove those bytes. Null
 * when there is nothing to remove — including when the same photo was uploaded
 * again, which lands on the same key because the key is its hash.
 */
export async function setAvatar(
  db: Database,
  userId: string,
  avatar: { fileId: string; mimeType: string },
): Promise<string | null> {
  const [previous] = await db
    .select({ fileId: users.avatarFileId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db
    .update(users)
    .set({
      avatarFileId: avatar.fileId,
      avatarMimeType: avatar.mimeType,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  const replaced = previous?.fileId ?? null;
  return replaced && replaced !== avatar.fileId ? replaced : null;
}

/**
 * Leave someone with no photo at all, and say which bytes to remove.
 *
 * The provider's URL goes with it. "Remove" on a profile means the photo is
 * gone, and clearing only the uploaded one would leave a face on screen that
 * the button just said it had removed.
 */
export async function clearAvatar(db: Database, userId: string): Promise<string | null> {
  // Read before the write: an UPDATE returns the row as it now stands, which
  // is the cleared one, and the id that was there is the whole point.
  const [previous] = await db
    .select({ fileId: users.avatarFileId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db
    .update(users)
    .set({
      avatarFileId: null,
      avatarMimeType: null,
      avatarUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return previous?.fileId ?? null;
}
