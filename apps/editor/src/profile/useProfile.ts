import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchProfile, saveProfile, type Profile, type ProfileChanges } from './profile-api';

/**
 * The signed-in account's own profile, held for the life of the board.
 *
 * Kept here rather than inside the settings dialog because two things need it
 * and only one of them is the dialog: the cursor colour goes out on this
 * client's presence record, which is published whether or not anyone has opened
 * settings. The dialog edits the same copy and everything else reads it.
 */

export interface ProfileState {
  readonly profile: Profile | null;
  readonly loading: boolean;
  readonly saving: boolean;
  /** Why the last load or save failed, if either did. */
  readonly error: string | null;
  /** True once it saved. False leaves `error` set, and the dialog stays open. */
  readonly save: (changes: ProfileChanges) => Promise<boolean>;
}

/**
 * Where a save is announced to this account's other windows.
 *
 * Same browser only — this is a browser channel, not a network one. A profile
 * saved on another device arrives when this window's token is next reminted,
 * which is minutes away; see onNameSaved.
 */
const PROFILE_CHANNEL = 'canvasflow:profile';

export interface UseProfileOptions {
  /**
   * Called after a save that changed the display name.
   *
   * The name collaborators read off a cursor rides on the editor token, which
   * is minted for a few minutes at a time — so without something to prompt it,
   * a rename reaches them whenever the next scheduled refresh happens to fall.
   */
  onNameSaved?: () => void;
  /**
   * A value that changes whenever the editor token is reminted.
   *
   * That remint is the only regular beat this window has, so the profile is
   * re-read on it. It is how a change made on another device — where the
   * browser channel above cannot reach — arrives without a reload.
   */
  revalidateOn?: string | null;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}

/**
 * @param enabled Whether there is an account to load one for. Guests have no
 * profile to read, so asking would spend a request to be told 401.
 */
export function useProfile(enabled: boolean, options: UseProfileOptions = {}): ProfileState {
  const revalidateOn = options.revalidateOn ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Through a ref so that `save` stays referentially stable: the caller passes
  // this inline, and a new identity each render would otherwise rebuild it.
  const onNameSavedRef = useRef(options.onNameSaved);
  onNameSavedRef.current = options.onNameSaved;

  // The profile as last applied, readable outside a render — the channel
  // listener below needs to compare against it without depending on it.
  const profileRef = useRef<Profile | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const apply = useCallback((next: Profile) => {
    profileRef.current = next;
    setProfile(next);
  }, []);

  /**
   * Keep this account's other windows in step.
   *
   * Each window loads the profile once and then has no reason to ask again, so
   * a name or colour saved in one of them used to sit stale in the rest until
   * they were reloaded. They hear about it here instead, and the one that saved
   * never receives its own message.
   */
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(PROFILE_CHANNEL);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<Profile>) => {
      const next = event.data;
      // Same origin and same browser, but still a message this hook did not
      // construct, and still one that could arrive for a different account —
      // signing out and back in leaves the old window open.
      if (!next || typeof next.id !== 'string' || typeof next.name !== 'string') return;
      if (profileRef.current && profileRef.current.id !== next.id) return;

      const renamed = profileRef.current?.name !== next.name;
      apply(next);

      // The name this window puts on its own cursor comes from its token, which
      // knows nothing about a save made in another one.
      if (renamed) onNameSavedRef.current?.();
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [enabled, apply]);

  useEffect(() => {
    if (!enabled) return;

    // A board can outlive this request — closing the tab mid-flight is the
    // ordinary case — so the response is dropped rather than set on a gone
    // component.
    let cancelled = false;
    setLoading(true);

    fetchProfile()
      .then((next) => {
        if (cancelled) return;
        apply(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Deliberately not fatal: failing to read a profile costs the cursor
        // colour and nothing else, and the board is what the person came for.
        setError(messageOf(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, apply, revalidateOn]);

  const save = useCallback(
    async (changes: ProfileChanges): Promise<boolean> => {
      setSaving(true);
      setError(null);
      try {
        const next = await saveProfile(changes);
        apply(next);
        channelRef.current?.postMessage(next);
        // Only for a name. The colour travels on the presence record and is
        // already on every screen by now; the token knows nothing about it.
        if (changes.name !== undefined) onNameSavedRef.current?.();
        return true;
      } catch (cause: unknown) {
        setError(messageOf(cause));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [apply],
  );

  return useMemo(
    () => ({ profile, loading, saving, error, save }),
    [profile, loading, saving, error, save],
  );
}
