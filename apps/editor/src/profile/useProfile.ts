import { useCallback, useEffect, useMemo, useState } from 'react';
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}

/**
 * @param enabled Whether there is an account to load one for. Guests have no
 * profile to read, so asking would spend a request to be told 401.
 */
export function useProfile(enabled: boolean): ProfileState {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setProfile(next);
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
  }, [enabled]);

  const save = useCallback(async (changes: ProfileChanges): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      setProfile(await saveProfile(changes));
      return true;
    } catch (cause: unknown) {
      setError(messageOf(cause));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return useMemo(
    () => ({ profile, loading, saving, error, save }),
    [profile, loading, saving, error, save],
  );
}
