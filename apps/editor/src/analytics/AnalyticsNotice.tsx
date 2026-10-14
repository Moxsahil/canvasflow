import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { needsTermsNotice } from '../profile/TermsNotice';
import type { Profile } from '../profile/profile-api';

/**
 * Whether to ask this account about usage analytics: signed in, never asked,
 * and not already being asked something else.
 *
 * An address still waiting to be confirmed has its own card in this corner,
 * and the terms window outranks both, so this waits for them. Asked through a
 * web app that cannot record the answer, it would not be asked at all.
 */
export function needsAnalyticsNotice(profile: Profile | null): boolean {
  return (
    profile !== null &&
    !profile.isGuest &&
    profile.emailVerified &&
    profile.analytics === null &&
    !needsTermsNotice(profile)
  );
}

/**
 * The one-time question: may we count how CanvasFlow is used?
 *
 * Shown once per account, not per browser — either answer is saved on the
 * account, and the card goes in every window as the profile comes back. Not in
 * the way: the board works around it, and the answer can be changed any time
 * in Settings → Data & Privacy.
 */
export function AnalyticsNotice({
  profile,
  onAnswer,
}: {
  profile: Profile | null;
  /** Saves the answer; resolves false when it could not. */
  onAnswer: (allow: boolean) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!needsAnalyticsNotice(profile)) return null;

  const answer = async (allow: boolean) => {
    setBusy(true);
    setFailed(false);
    const saved = await onAnswer(allow);
    setBusy(false);
    if (!saved) setFailed(true);
  };

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3 text-foreground">
      <div
        role="dialog"
        aria-labelledby="cf-analytics-notice-title"
        aria-describedby="cf-analytics-notice-body"
        className="pointer-events-auto flex flex-col gap-3 rounded-lg border border-border bg-background p-4 shadow-sm"
        data-testid="analytics-notice"
      >
        <div className="flex items-start gap-3">
          <BarChart3 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span id="cf-analytics-notice-title" className="text-sm font-semibold">
              Help improve CanvasFlow?
            </span>
            <span id="cf-analytics-notice-body" className="text-xs text-foreground/70">
              Share anonymous usage data, like which tools you use. Never what’s on your boards. You
              can change this any time in Settings → Data &amp; Privacy.
            </span>
            {failed && (
              <span role="alert" className="text-xs text-destructive">
                Your answer couldn’t be saved. Try again.
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void answer(false)}>
            No thanks
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void answer(true)}>
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}
