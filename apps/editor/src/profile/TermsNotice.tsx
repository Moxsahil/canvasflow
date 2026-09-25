import { useState } from 'react';
import { ExternalLink, ScrollText } from 'lucide-react';
import { TERMS_VERSION } from '@canvasflow/types';
import { env } from '@/lib/env';
import { SurfaceDialog } from '../ui/SurfaceDialog';
import { SurfaceButton } from '../ui/surface-ui';
import type { SurfaceTheme } from '../ui/surface-palette';
import type { Profile } from './profile-api';

/** Printed and parsed in UTC, so the date never slips a day for the reader's zone. */
const UPDATED_FORMAT = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Whether this account has to be asked about the terms: one signed in, whose
 * agreement on record is missing or is to terms since replaced.
 *
 * Guests are never asked. Joining by link records their agreement as they
 * join, and a guest identity from before that is not one worth stopping.
 */
export function needsTermsNotice(profile: Profile | null): boolean {
  return (
    profile !== null &&
    !profile.isGuest &&
    // Absent from a web app older than this editor, which can neither say what
    // was agreed nor record an answer. Nobody is asked until it can.
    profile.termsVersion !== undefined &&
    profile.termsVersion !== TERMS_VERSION
  );
}

interface TermsNoticeProps {
  profile: Profile | null;
  /** Records agreement, resolving once the profile says so; throws when it could not. */
  onAccept: () => Promise<void>;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

/**
 * Asks an account with no agreement on record to agree to the terms.
 *
 * For accounts made before agreement was recorded at signup, and for everyone
 * once the terms change. It is shown once: Continue records the version in
 * force, the profile comes back saying so, and it does not appear again — in
 * this window or any other the account has open.
 *
 * Not dismissable, like the other window that stands between someone and the
 * board. Continuing to use CanvasFlow is what the terms ask agreement to, so
 * closing this and carrying on would be the same answer given without the
 * record of it. Reading them is always one click away, in a new tab, so the
 * board is still here afterwards.
 */
export function TermsNotice({ profile, onAccept, theme }: TermsNoticeProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = needsTermsNotice(profile);
  // Agreed before, to terms that have since been replaced.
  const changed = profile?.termsVersion != null;
  const termsUrl = new URL('/terms', env.VITE_WEB_URL).toString();

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAccept();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SurfaceDialog
      open={open}
      theme={theme}
      alert
      // Escape, the backdrop and the close button all go with this.
      dismissable={false}
      title={changed ? 'Our Terms of Service have changed' : 'We’ve published our Terms of Service'}
      subtitle={`Last updated ${UPDATED_FORMAT.format(new Date(TERMS_VERSION))}`}
      leading={
        <span className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--surface-accent)]">
          <ScrollText className="size-[18px]" aria-hidden="true" />
        </span>
      }
      width={480}
      // Never called: nothing here closes it except agreeing, which does so by
      // changing the profile it reads.
      onClose={() => {}}
      data-testid="terms-notice"
      footer={
        <>
          <div className="flex-1" />
          <SurfaceButton
            variant="ghost"
            onClick={() => window.open(termsUrl, '_blank', 'noopener,noreferrer')}
          >
            Read the terms
            <ExternalLink size={13} aria-hidden="true" />
          </SurfaceButton>
          <SurfaceButton variant="primary" loading={busy} onClick={() => void accept()}>
            Continue
          </SurfaceButton>
        </>
      }
    >
      <div className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
        {changed ? (
          <>
            We’ve updated them since you last agreed. Choosing Continue means you agree to the new
            version.
          </>
        ) : (
          <>
            They set out what you can expect from CanvasFlow, and what we ask of you in return.
            Choosing Continue means you agree to them.
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[11.5px] leading-[1.6] text-[var(--surface-danger)]">
          {error}
        </p>
      )}
    </SurfaceDialog>
  );
}
