import { useId, useState } from 'react';
import { ExternalLink, ScrollText } from 'lucide-react';
import { TERMS_VERSION } from '@canvasflow/types';
import { formatTermsVersion, termsUrl } from '@/lib/legal-links';
import {
  SurfaceWindow,
  WindowBadge,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from '../ui/SurfaceWindow';
import type { SurfaceTheme } from '../ui/surface-palette';
import type { Profile } from './profile-api';

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
 * board: no ×, and Escape or a click outside do nothing. Continuing to use CanvasFlow is what the terms ask agreement to, so
 * closing this and carrying on would be the same answer given without the
 * record of it. Reading them is always one click away, in a new tab, so the
 * board is still here afterwards.
 */
export function TermsNotice({ profile, onAccept, theme }: TermsNoticeProps) {
  const titleId = useId();
  const bodyId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = needsTermsNotice(profile);
  // Agreed before, to terms that have since been replaced.
  const changed = profile?.termsVersion != null;

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
    <SurfaceWindow
      open={open}
      theme={theme}
      alert
      dismissable={false}
      // Never called: nothing here closes it except agreeing, which does so by
      // changing the profile it reads.
      onClose={() => {}}
      width={460}
      labelledBy={titleId}
      describedBy={bodyId}
      data-testid="terms-notice"
    >
      <WindowHeader
        titleId={titleId}
        title={
          changed ? 'Our Terms of Service have changed' : 'We’ve published our Terms of Service'
        }
        description={`Last updated ${formatTermsVersion(TERMS_VERSION)}`}
        lead={
          <WindowBadge tone="soft">
            <ScrollText aria-hidden="true" />
          </WindowBadge>
        }
      />

      <WindowBody>
        <p id={bodyId} className="text-[12.5px] leading-[1.6] text-[var(--surface-fg-muted)]">
          {changed
            ? 'We’ve updated them since you last agreed. Choosing Continue means you agree to the new version.'
            : 'They set out what you can expect from CanvasFlow, and what we ask of you in return. Choosing Continue means you agree to them.'}
        </p>
      </WindowBody>

      {/* Focus starts on the window rather than on Continue, so Enter doesn't
          agree on anyone's behalf. */}
      <WindowFooter status={error} danger>
        <WindowButton
          variant="ghost"
          onClick={() => window.open(termsUrl(), '_blank', 'noopener,noreferrer')}
        >
          Read the terms
          <ExternalLink aria-hidden="true" />
        </WindowButton>
        <WindowButton variant="primary" disabled={busy} onClick={() => void accept()}>
          {busy ? 'Saving…' : 'Continue'}
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}
