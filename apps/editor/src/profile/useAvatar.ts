import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sha256Hex } from '../images/prepare-image';
import { AvatarError, deleteAvatar, fetchAvatarUrl, uploadAvatar } from './avatar-client';

/**
 * One person's photo: where to read it from, and — for your own — how to
 * replace or remove it.
 *
 * A photo is never a URL on the wire. The bucket is private, so every read is
 * an authorized act that mints a short-lived signed URL, and what travels
 * instead is a version token. This resolves one into the other.
 */

interface CachedUrl {
  /** Null records that this person has no photo, which is worth caching too. */
  url: string | null;
  expiresAt: number;
}

/**
 * Resolved URLs, shared by every caller in this tab.
 *
 * Keyed by person *and* version, so a photo that changes is a different entry
 * rather than a stale one to invalidate. Outside React because the share dialog
 * and the sidebar ask for the same faces, and one request each is enough.
 */
const urlCache = new Map<string, CachedUrl>();

/** Renewed a minute early, so a URL is never handed out as it expires. */
const EXPIRY_MARGIN_MS = 60_000;

/** How long a provider's URL is kept before being asked for again. */
const EXTERNAL_URL_TTL_MS = 60 * 60 * 1000;

/**
 * How long "no photo" is remembered.
 *
 * Short, because nothing announces it when somebody adds one. It is the answer
 * for a list that asks by name alone — with a version in hand there is nothing
 * to guess at, since the version changes the moment the photo does.
 */
const ABSENCE_TTL_MS = 5 * 60 * 1000;

function cacheKey(userId: string, version: string | null): string {
  // A caller with no version is asking for whatever is current, which is a
  // different question from "the photo that version names".
  return `${userId}:${version ?? 'latest'}`;
}

/**
 * One person's photo URL, from the cache or from the API.
 *
 * Shared by both hooks below so that the sidebar and the share dialog cannot
 * end up asking separately for the same face.
 */
async function resolveAvatar(
  boardId: string,
  token: string,
  userId: string,
  version: string | null,
): Promise<string | null> {
  const key = cacheKey(userId, version);
  const cached = urlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const resolved = await fetchAvatarUrl(boardId, token, userId);
  const ttl = !resolved
    ? ABSENCE_TTL_MS
    : resolved.expiresIn
      ? resolved.expiresIn * 1000 - EXPIRY_MARGIN_MS
      : EXTERNAL_URL_TTL_MS;

  urlCache.set(key, { url: resolved?.url ?? null, expiresAt: Date.now() + ttl });
  return resolved?.url ?? null;
}

export interface AvatarState {
  /** Null while there is no photo, or none resolved yet. */
  readonly url: string | null;
  readonly busy: boolean;
  readonly error: string | null;
  /** True once the photo is stored and the profile points at it. */
  readonly upload: (blob: Blob, mimeType: string) => Promise<boolean>;
  readonly remove: () => Promise<boolean>;
}

interface UseAvatarOptions {
  boardId: string;
  /** The editor's bearer token. Storage is reached through the gateway. */
  token: string | null;
  userId: string | null;
  /** From the profile. Null means there is no photo to fetch. */
  version: string | null;
  /** Re-read the profile, so a new version — or none — comes back. */
  onChanged: () => Promise<void> | void;
}

function messageOf(cause: unknown): string {
  if (cause instanceof AvatarError) return cause.message;
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}

export function useAvatar({
  boardId,
  token,
  userId,
  version,
  onChanged,
}: UseAvatarOptions): AvatarState {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    if (!token || !userId || !version) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    resolveAvatar(boardId, token, userId, version)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        // A photo that will not resolve is a set of initials instead. Saying so
        // in the chrome would be noise about an avatar.
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, token, userId, version]);

  const upload = useCallback(
    async (blob: Blob, mimeType: string): Promise<boolean> => {
      if (!token) return false;
      setBusy(true);
      setError(null);
      try {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await uploadAvatar(token, await sha256Hex(bytes), mimeType, bytes);
        // The profile is what names the photo, so the new version has to come
        // from there before anything will look for it.
        await onChangedRef.current();
        return true;
      } catch (cause: unknown) {
        setError(messageOf(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const remove = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    setBusy(true);
    setError(null);
    try {
      await deleteAvatar(token);
      await onChangedRef.current();
      return true;
    } catch (cause: unknown) {
      setError(messageOf(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, [token]);

  return useMemo(() => ({ url, busy, error, upload, remove }), [url, busy, error, upload, remove]);
}

/** Somebody whose photo a list wants, and how it knows which photo. */
export interface AvatarSubject {
  id: string;
  /**
   * Their photo's version, where the caller has one.
   *
   * Presence carries it, so the peer list asks exactly. Membership comes from
   * the web app, which knows nothing about storage, so the access list asks for
   * whatever is current and lives with a short cache instead.
   */
  version?: string | null;
}

/**
 * Photos for a list of people, by user id.
 *
 * Anyone without one simply has no entry, and the caller draws their initials.
 */
export function useAvatarUrls({
  boardId,
  token,
  subjects,
}: {
  boardId: string;
  token: string | null;
  subjects: readonly AvatarSubject[];
}): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Flattened into one string so the effect runs when the set — or any one
  // person's photo — actually changes, rather than on every render that
  // rebuilds the array.
  const key = [...new Set(subjects.map((s) => `${s.id}:${s.version ?? ''}`))].sort().join(',');

  useEffect(() => {
    if (!token || key.length === 0) return;

    let cancelled = false;
    const wanted = key.split(',').map((entry) => {
      const [id, version] = entry.split(':');
      return { id: id!, version: version || null };
    });

    void Promise.all(
      wanted.map(async ({ id, version }) => {
        try {
          return [id, await resolveAvatar(boardId, token, id, version)] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    ).then((resolved) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, url] of resolved) {
        if (url) next[id] = url;
      }
      setUrls(next);
    });

    return () => {
      cancelled = true;
    };
  }, [boardId, token, key]);

  return urls;
}
