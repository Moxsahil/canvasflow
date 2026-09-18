import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Profile } from './profile-api';
import { useVerificationStatus } from './useVerificationStatus';

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
 * The card watches for the address being confirmed in another tab and takes
 * itself away when that happens, rather than waiting for a reload.
 */
export function VerificationNotice({
  profile,
  token,
  onVerified,
}: {
  profile: Profile | null;
  /** The editor's bearer token: the status endpoint is on the gateway. */
  token: string | null;
  /** Fired once, when confirmation lands, so the rest of the editor re-reads. */
  onVerified?: () => void;
}) {
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

  const showing = email !== null && !dismissed && !alreadySeen;

  // Runs only while the card is on screen, and stops itself the moment the
  // answer comes back true.
  const verified = useVerificationStatus(token, showing, onVerified);

  if (!showing || verified) return null;

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
