/**
 * What the server will authorize a profile photo upload for.
 *
 * Narrower than the board-image list next door, and deliberately so. A board
 * image is something a person chose to place and is looking at; an avatar is
 * drawn in chrome, beside other people's names, at sizes where nothing exotic
 * buys anything. SVG is the pointed omission: it is inert in the `<img>` that
 * is the only thing ever pointed at one of these, but an avatar has no reason
 * to be a document in the first place.
 */
export const ALLOWED_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type AllowedAvatarMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

export function isAllowedAvatarMimeType(type: string): type is AllowedAvatarMimeType {
  return (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Largest photo we will authorize.
 *
 * The editor crops and re-encodes to a few hundred pixels square before it asks,
 * so anything approaching this cap means a client that did not — which is worth
 * refusing rather than storing.
 */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** A hex sha256 and nothing else, so an id cannot traverse out of its prefix. */
export const AVATAR_FILE_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The object key for one person's photo.
 *
 * Owner first, so everything belonging to an account is a prefix that can be
 * removed as a unit when the account is. The file id is the hash of the bytes,
 * which is what lets the same photo be uploaded twice without storing it twice.
 */
export function avatarObjectKey(userId: string, fileId: string): string {
  return `avatars/${userId}/${fileId}`;
}
