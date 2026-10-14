import { useCallback, useEffect } from 'react';
import type { ProfileState } from '../profile/useProfile';
import { startAnalytics, stopAnalytics, track } from './analytics';

export interface UsageAnalytics {
  /**
   * The account's answer: null before it has given one, and always null for a
   * guest, who is never asked.
   */
  consent: boolean | null;
  /** Save an answer, from the one-time card or the Settings switch. */
  choose: (allow: boolean) => Promise<boolean>;
}

/**
 * Usage analytics for the signed-in account, following its answer.
 *
 * The answer lives on the account, so it is the same in every window and on
 * every device: a yes starts analytics here, a no stops it and forgets this
 * browser's id, and no answer yet means nothing is loaded at all.
 */
export function useUsageAnalytics(account: ProfileState, boardId: string): UsageAnalytics {
  const profile = account.profile;
  const userId = profile && !profile.isGuest ? profile.id : null;
  // Absent from a web app older than this editor; read as no answer.
  const consent = userId ? (profile?.analytics ?? null) : null;

  useEffect(() => {
    if (consent === true && userId) {
      void startAnalytics(userId).then(() => track('board_opened'));
    } else if (consent === false) {
      stopAnalytics();
    }
  }, [consent, userId, boardId]);

  const { save } = account;
  const choose = useCallback(
    async (allow: boolean) => {
      const saved = await save({ analytics: allow });
      if (saved && allow && userId) {
        await startAnalytics(userId);
        track('analytics_enabled');
      }
      return saved;
    },
    [save, userId],
  );

  return { consent, choose };
}
