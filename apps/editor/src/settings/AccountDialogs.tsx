import { useState } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { PASSWORD_MAX_LENGTH, PASSWORD_RULES, meetsPasswordRules } from '@canvasflow/types';
import { cn } from '@/lib/utils';
import { sessionResumeUrl } from '../auth/token';
import {
  AccountSecurityError,
  changePassword,
  sendPasswordSetupLink,
  signOutEverywhere,
  type AccountSecurity,
  type SignedOut,
} from './account-security-api';
import { formatDay, providerNames } from './account-format';
import { GitHubMark, GoogleMark } from './provider-marks';
import {
  ErrorLine,
  INPUT,
  SettingsButton,
  SettingsModal,
  StatusTag,
  DialogList,
  DialogListRow,
} from './settings-ui';

/**
 * The dialogs behind the Account & Security rows, each over the Settings window.
 *
 * Every one of them states what will happen before it happens, and what did
 * happen afterwards: these are the changes to an account that somebody is most
 * likely to be anxious about, and least likely to want to guess at.
 */

function messageOf(error: unknown): string {
  return error instanceof AccountSecurityError || error instanceof Error
    ? error.message
    : 'Something went wrong. Try again.';
}

/**
 * A password field with its own show/hide. Each field owns its toggle, so
 * revealing one never reveals another.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  invalid = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        type={shown ? 'text' : 'password'}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        maxLength={autoComplete === 'new-password' ? PASSWORD_MAX_LENGTH : 200}
        aria-invalid={invalid}
        autoFocus={autoFocus}
        className={cn(
          INPUT,
          'pr-[38px]',
          invalid &&
            'border-[var(--surface-danger-border)] focus:border-[var(--surface-danger)] focus:shadow-none',
        )}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-[34px] items-center justify-center text-[var(--surface-fg-faint)] transition-colors hover:text-[var(--surface-fg)] focus-visible:text-[var(--surface-fg)] focus-visible:outline-none"
      >
        {shown ? <EyeOff className="size-[14px]" /> : <Eye className="size-[14px]" />}
      </button>
    </div>
  );
}

function Rule({ label, met }: { label: string; met: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-[6px] text-[11px]',
        met ? 'text-[var(--surface-fg)]' : 'text-[var(--surface-fg-faint)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-[5px] shrink-0 rounded-full',
          met ? 'bg-[var(--surface-ok)]' : 'bg-[var(--surface-toggle-off)]',
        )}
      />
      {label}
    </li>
  );
}

// ---------------------------------------------------------------------------

export function ChangePasswordDialog({
  token,
  email,
  onClose,
  onChanged,
}: {
  token: string | null;
  email: string;
  onClose: () => void;
  /** The password changed; the page reads the account again. */
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SignedOut | null>(null);

  const mismatched = confirm.length > 0 && confirm !== next;
  const ready = current.length > 0 && meetsPasswordRules(next) && next === confirm && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const signedOut = await changePassword(token, {
        currentPassword: current,
        newPassword: next,
        signOutOtherDevices: signOutOthers,
      });
      setDone(signedOut);
      onChanged();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const signIn = done === 'everywhere';
    return (
      <SettingsModal
        title="Password changed"
        description={
          done === 'other-devices'
            ? 'Every other device has been signed out. This one stays signed in.'
            : signIn
              ? 'Every device has been signed out, this one too. Sign in again with your new password.'
              : 'Devices that were already signed in stay signed in.'
        }
        onClose={onClose}
        actions={
          <SettingsButton
            variant="primary"
            onClick={
              signIn
                ? () => {
                    window.location.href = sessionResumeUrl();
                  }
                : onClose
            }
          >
            {signIn ? 'Sign in' : 'Done'}
          </SettingsButton>
        }
      />
    );
  }

  return (
    <SettingsModal
      title="Change password"
      description="Enter your current password, then choose a new one. We'll email you to confirm the change."
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            Cancel
          </SettingsButton>
          <SettingsButton variant="primary" type="submit" disabled={!ready}>
            {busy ? 'Changing…' : 'Change password'}
          </SettingsButton>
        </>
      }
    >
      {/* Tells a password manager which saved entry this replaces. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <PasswordField
        label="Current password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        autoFocus
      />
      <PasswordField
        label="New password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
      />
      <PasswordField
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        invalid={mismatched}
      />

      {next.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-[12px] gap-y-[4px]" aria-live="polite">
          {PASSWORD_RULES.map((rule) => (
            <Rule key={rule.label} label={rule.label} met={rule.test(next)} />
          ))}
          {confirm.length > 0 && <Rule label="Passwords match" met={!mismatched} />}
        </ul>
      )}

      <label className="flex cursor-pointer items-start gap-[8px] pt-[2px] text-[12px] text-[var(--surface-fg)]">
        <input
          type="checkbox"
          checked={signOutOthers}
          onChange={(event) => setSignOutOthers(event.target.checked)}
          className="mt-[2px] size-[14px] shrink-0 accent-[var(--surface-accent)]"
        />
        <span>
          Sign out other devices
          <span className="block text-[11px] text-[var(--surface-fg-muted)]">
            Recommended if you think someone else knows your password.
          </span>
        </span>
      </label>

      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}

// ---------------------------------------------------------------------------

export function AddPasswordDialog({
  token,
  security,
  onClose,
}: {
  token: string | null;
  security: AccountSecurity;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const via = providerNames(security.providers) || 'your provider';

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendPasswordSetupLink(token);
      setSent(true);
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <SettingsModal
        title="Check your email"
        description={`We sent a link to ${security.email}. It expires in 30 minutes. Once you set a password there, you'll be signed out everywhere and can sign in with either your password or ${via}.`}
        onClose={onClose}
        actions={
          <SettingsButton variant="primary" onClick={onClose}>
            Done
          </SettingsButton>
        }
      />
    );
  }

  return (
    <SettingsModal
      title="Add a password"
      description={`Your account signs in with ${via}. We'll email ${security.email} a link to set a password, so you can also sign in with your email. The link proves the inbox is yours, so nobody at an unlocked computer can add one for you.`}
      onClose={onClose}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            Cancel
          </SettingsButton>
          <SettingsButton variant="primary" onClick={() => void send()} disabled={busy}>
            {busy ? 'Sending…' : 'Email me a link'}
          </SettingsButton>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}

// ---------------------------------------------------------------------------

export function ConnectedAccountsDialog({
  security,
  onClose,
}: {
  security: AccountSecurity;
  onClose: () => void;
}) {
  const linked = (provider: 'google' | 'github') => security.providers.includes(provider);
  const tag = (on: boolean, yes: string, no: string) => (
    <StatusTag tone={on ? 'positive' : 'neutral'}>{on ? yes : no}</StatusTag>
  );

  return (
    <SettingsModal
      title="Connected accounts"
      description="Every way you can sign in to CanvasFlow."
      onClose={onClose}
      actions={
        <SettingsButton variant="primary" onClick={onClose}>
          Done
        </SettingsButton>
      }
    >
      <DialogList>
        {/* The envelope keeps the three names in one column beside the two marks. */}
        <DialogListRow
          icon={<Mail className="size-[16px] text-[var(--surface-fg-muted)]" aria-hidden="true" />}
          title="Email and password"
          detail={security.email}
          tag={tag(security.hasPassword, 'Set', 'Not set')}
        />
        <DialogListRow
          icon={<GoogleMark />}
          title="Google"
          tag={tag(linked('google'), 'Connected', 'Not connected')}
        />
        <DialogListRow
          icon={<GitHubMark />}
          title="GitHub"
          tag={tag(linked('github'), 'Connected', 'Not connected')}
        />
      </DialogList>
      <p className="text-[11.5px] leading-[1.55] text-[var(--surface-fg-muted)]">
        To connect Google or GitHub, sign in with it using {security.email}. An account with the
        same confirmed email address is joined to this one automatically.
      </p>
    </SettingsModal>
  );
}

// ---------------------------------------------------------------------------

export function SessionsDialog({
  security,
  onClose,
}: {
  security: AccountSecurity;
  onClose: () => void;
}) {
  return (
    <SettingsModal
      title="Active sessions"
      description="Where your account is signed in right now. Location is approximate."
      onClose={onClose}
      actions={
        <SettingsButton variant="primary" onClick={onClose}>
          Done
        </SettingsButton>
      }
    >
      <DialogList>
        {security.sessions.map((session) => (
          <DialogListRow
            key={session.id}
            title={session.device ?? 'Unknown browser'}
            detail={`${session.location ?? 'Location unknown'} · Active since ${formatDay(
              session.signedInAt,
            )}`}
            tag={session.current ? <StatusTag tone="positive">This device</StatusTag> : undefined}
          />
        ))}
      </DialogList>
    </SettingsModal>
  );
}

// ---------------------------------------------------------------------------

export function SignOutEverywhereDialog({
  token,
  deviceCount,
  onClose,
}: {
  token: string | null;
  deviceCount: number;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOutEverywhere(token);
      // Through the gateway's resume route, which lands on sign-in now that
      // there is no session left to resume.
      window.location.href = sessionResumeUrl();
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  };

  const devices =
    deviceCount > 1 ? `all ${deviceCount} devices, including this one` : 'this device';

  return (
    <SettingsModal
      title="Sign out everywhere?"
      description={`This signs out ${devices}, and closes any board open on them. You'll need to sign in again.`}
      onClose={onClose}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            Cancel
          </SettingsButton>
          <SettingsButton variant="danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out all'}
          </SettingsButton>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}
