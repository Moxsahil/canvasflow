import { useEffect, useState } from 'react';
import { resendVerification } from '../profile/verification-status';
import { useVerificationStatus } from '../profile/useVerificationStatus';
import { Row, RowText, SecondaryButton, StatusTag } from './settings-ui';

/**
 * Matches the server's own per-minute rule.
 *
 * Only a courtesy. The countdown on screen is here so the button does not
 * invite a press that would be refused; the limit that counts is enforced by
 * the API, because anything can call it directly.
 */
const COOLDOWN_SECONDS = 60;

type Status = 'idle' | 'sending' | 'sent' | 'failed';

interface EmailRowProps {
  /** Null for a guest, whose stored address is a synthetic placeholder. */
  email: string | null;
  verified: boolean;
  /** The editor's bearer token. The verification routes are on the gateway. */
  token: string | null;
  /** Re-reads the profile once confirmation lands, so the rest of the app agrees. */
  onVerified?: () => void;
}

/**
 * The account's address, and whether it has been confirmed.
 *
 * The "Change" placeholder that used to sit here is gone: this row now has a
 * control that does something, and a disabled button beside it was competing
 * for the same space while doing nothing. Changing an address is its own flow,
 * with its own confirmation, and it can come back with that.
 */
export function EmailRow({ email, verified, token, onVerified }: EmailRowProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [cooldown, setCooldown] = useState(0);

  // The dialog is mounted only while open, so this polls exactly while the row
  // is on screen. Without it the row shows whatever the profile said when it
  // was last read, which can be minutes old — and the board's notice card is
  // not a substitute, because dismissing that card stops it polling.
  const polled = useVerificationStatus(token, !verified, onVerified);
  const confirmed = verified || polled;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const send = async () => {
    if (!token || cooldown > 0) return;
    setStatus('sending');

    try {
      const result = await resendVerification(token);

      if (result.status === 'sent') {
        setStatus('sent');
        setCooldown(COOLDOWN_SECONDS);
        return;
      }

      if (result.status === 'rate-limited') {
        // Not an error to report. The button simply goes quiet for as long as
        // the server says, which is the honest number rather than ours.
        setStatus('idle');
        setCooldown(result.retryAfterSeconds);
        return;
      }

      // 'already-verified' lands here too. The profile will say so on its next
      // read, and claiming a mail went out would be a lie.
      setStatus(result.status === 'not-sent' ? 'failed' : 'idle');
    } catch {
      setStatus('failed');
    }
  };

  if (confirmed) {
    return (
      <Row>
        <RowText
          title="Email"
          hint={email ?? 'No address on this account'}
          badge={<StatusTag tone="positive">Verified</StatusTag>}
        />
      </Row>
    );
  }

  return (
    <Row>
      <RowText
        title="Email"
        hint={hintFor(email, status, cooldown)}
        badge={<StatusTag tone="caution">Unverified</StatusTag>}
      />
      <SecondaryButton onClick={() => void send()} disabled={!token || cooldown > 0}>
        {buttonLabel(status, cooldown)}
      </SecondaryButton>
    </Row>
  );
}

function hintFor(email: string | null, status: Status, cooldown: number): string {
  if (status === 'failed') return 'That did not send. Try again in a moment.';
  if (status === 'sent' && cooldown > 0) {
    return `Sent to ${email ?? 'your address'}. Check your inbox.`;
  }
  return email ?? 'No address on this account';
}

function buttonLabel(status: Status, cooldown: number): string {
  if (status === 'sending') return 'Sending…';
  if (cooldown > 0) return `Wait ${cooldown}s`;
  return 'Send verification email';
}
