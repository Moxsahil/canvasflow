import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile } from './profile-api';

/**
 * Remembered per address, so confirming one account does not silence the notice
 * for whoever signs in on this machine next.
 */
const dismissedKey = (email: string) => `cf:verify-dismissed:${email}`;

/**
 * The nudge that replaced the "check your email" screen.
 *
 * Signing up no longer parks anyone on a page telling them to go and read their
 * inbox; they land on a board and hear about it here, so the product is doing
 * something while the mail is still in flight. Nothing is let through that was
 * not already — signing in never required a confirmed address.
 *
 * The profile is passed in rather than fetched. The editor already loads it
 * once and re-reads it whenever the auth token is reminted, which is what makes
 * this disappear on its own: confirm the address in another tab, and the next
 * remint drops `emailVerified` to true and takes the card with it. A second
 * fetch here would have its own, staler, answer.
 *
 * The card is the one from components/ui/notifications, with two departures.
 * The wrapper sets `text-foreground`, which the reference puts on the section it
 * ships inside — without it the title has no colour of its own and inherits the
 * canvas, which in the dark theme is the same colour it is written on.
 *
 * And the body is `foreground/70` rather than `muted-foreground`: this theme
 * sets that to hsl(0 0% 56%), around 3:1 on white, which is under the contrast
 * a 12px line needs. Seventy per cent of the foreground clears it in both
 * themes and still sits back from the title.
 */
export function VerificationNotice({ profile }: { profile: Profile | null }) {
  const [dismissed, setDismissed] = useState(false);

  const email = profile && !profile.isGuest && !profile.emailVerified ? profile.email : null;

  let alreadySeen = false;
  if (email) {
    try {
      alreadySeen = localStorage.getItem(dismissedKey(email)) === '1';
    } catch {
      // Private windows and blocked storage both land here. Showing the notice
      // again is the harmless side to fail on.
    }
  }

  if (!email || dismissed || alreadySeen) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissedKey(email), '1');
    } catch {
      // Dismissing still works for this session, it just is not remembered.
    }
  };

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-3 text-foreground">
      <div
        role="status"
        className="pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-background p-4 shadow-sm"
      >
        <Info className={cn('mt-0.5 size-5 shrink-0', 'text-foreground')} aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">Confirm your email</span>
          <span className="text-xs text-foreground/70">
            We sent a link to <span className="break-all">{email}</span>. Click it to confirm your
            address — your boards are saved either way.
          </span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
