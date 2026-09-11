import { env } from '@/lib/env';

/**
 * Transport for profile photo bytes.
 *
 * The same two-step shape board images use: the API authorizes an upload and
 * signs a URL, and the bytes go straight to object storage. Nothing large
 * passes through our own server in either direction.
 *
 * These routes take the editor's bearer token rather than the web app's cookie,
 * because object storage is reached through the gateway — the profile's other
 * fields go to the web app, which is why this is a separate client from
 * profile-api.
 */

export class AvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarError';
  }
}

async function failureMessage(res: Response): Promise<string> {
  if (res.status === 401) return 'Your session expired. Reload the board and try again.';
  if (res.status === 503) return 'Photo storage is not configured.';
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    if (body.message) return body.message;
    if (body.error) return body.error;
  } catch {
    // Fall through to the generic message.
  }
  return `Something went wrong (${res.status}).`;
}

function avatarUrl(path = ''): string {
  return `${env.VITE_API_URL}/users/me/avatar${path}`;
}

interface PresignedUpload {
  url: string;
  /** Sent verbatim: they are part of the signature, not decoration. */
  headers: Record<string, string>;
}

/**
 * Send a photo, then record it.
 *
 * Recorded only once the bytes have landed. A profile that names an object
 * nobody wrote is worse than one with no photo: every collaborator would ask
 * for it and every one of them would fail.
 */
export async function uploadAvatar(
  token: string,
  fileId: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<void> {
  const authorization = await fetch(avatarUrl('/upload-url'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileId, mimeType, sizeBytes: bytes.length }),
  });
  if (!authorization.ok) throw new AvatarError(await failureMessage(authorization));

  const { data } = (await authorization.json()) as { data: PresignedUpload };

  const upload = await fetch(data.url, {
    method: 'PUT',
    headers: data.headers,
    body: bytes as BodyInit,
  });
  if (!upload.ok) throw new AvatarError('The photo could not be uploaded. Try again.');

  const commit = await fetch(avatarUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileId, mimeType }),
  });
  if (!commit.ok) throw new AvatarError(await failureMessage(commit));
}

export async function deleteAvatar(token: string): Promise<void> {
  const res = await fetch(avatarUrl(), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new AvatarError(await failureMessage(res));
}

export interface ResolvedAvatar {
  url: string;
  /** Null for a provider's URL, which we did not sign and cannot expire. */
  expiresIn: number | null;
}

/**
 * Where to read one person's photo from, asked through the board you share.
 *
 * Answers 404 for "no photo" as readily as for "no such person here", and both
 * mean the same thing to a caller: draw their initial instead.
 */
export async function fetchAvatarUrl(
  boardId: string,
  token: string,
  userId: string,
): Promise<ResolvedAvatar | null> {
  const res = await fetch(`${env.VITE_API_URL}/boards/${boardId}/avatars/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new AvatarError(await failureMessage(res));

  const body = (await res.json()) as { data: ResolvedAvatar };
  return body.data;
}
