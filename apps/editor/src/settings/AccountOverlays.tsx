import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
import {
  DangerButton,
  GhostButton,
  PrimaryButton,
  SettingsOverlay,
  StatusTag,
} from './settings-ui';

/**
 * The steps behind the Account & Security rows, each drawn over the pane.
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

function ErrorLine({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-[11.5px] text-[var(--surface-danger)]">
      {children}
    </p>
  );
}

/**
 * A password field with its own show/hide. Each field owns its toggle, so
 * revealing one never reveals another.
 */
function PasswordField({
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
          'w-full rounded-[7px] border bg-[var(--surface-input)] py-[8px] pl-[10px] pr-[38px] text-[12.5px] text-[var(--surface-fg)] placeholder:text-[var(--surface-fg-faint)] focus:outline-none',
          invalid
            ? 'border-[var(--surface-danger-border)] focus:border-[var(--surface-danger)]'
            : 'border-[var(--surface-border)] focus:border-[var(--surface-accent)]',
        )}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-[34px] items-center justify-center text-[var(--surface-fg-faint)] transition-colors hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:text-[var(--surface-fg)]"
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
          met ? 'bg-emerald-500' : 'bg-[var(--surface-toggle-off)]',
        )}
      />
      {label}
    </li>
  );
}

// ---------------------------------------------------------------------------

export function ChangePasswordOverlay({
  token,
  email,
  onClose,
  onChanged,
}: {
  token: string | null;
  email: string;
  onClose: () => void;
  /** The password changed; the pane re-reads the account. */
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
    return (
      <SettingsOverlay
        title="Password changed"
        description={
          done === 'other-devices'
            ? 'Every other device has been signed out. This one stays signed in.'
            : done === 'everywhere'
              ? 'Every device has been signed out, this one too. Sign in again with your new password.'
              : 'Devices that were already signed in stay signed in.'
        }
        actions={
          <PrimaryButton
            onClick={
              done === 'everywhere'
                ? () => {
                    window.location.href = sessionResumeUrl();
                  }
                : onClose
            }
          >
            {done === 'everywhere' ? 'Sign in' : 'Done'}
          </PrimaryButton>
        }
      />
    );
  }

  return (
    <SettingsOverlay
      title="Change password"
      description="Enter your current password, then choose a new one. We'll email you to confirm the change."
      onSubmit={() => void submit()}
      actions={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={!ready}>
            {busy ? 'Changing…' : 'Change password'}
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col gap-[10px]">
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
            <span className="block text-[11px] text-[var(--surface-fg-faint)]">
              Recommended if you think someone else knows your password.
            </span>
          </span>
        </label>

        <ErrorLine>{error}</ErrorLine>
      </div>
    </SettingsOverlay>
  );
}

// ---------------------------------------------------------------------------

export function AddPasswordOverlay({
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
      <SettingsOverlay
        title="Check your email"
        description={`We sent a link to ${security.email}. It expires in 30 minutes. Once you set a password there, you'll be signed out everywhere and can sign in with either your password or ${via}.`}
        actions={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}
      />
    );
  }

  return (
    <SettingsOverlay
      title="Add a password"
      description={`Your account signs in with ${via}. We'll email ${security.email} a link to set a password, so you can also sign in with your email. The link proves the inbox is yours, so nobody at an unlocked computer can add one for you.`}
      actions={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={() => void send()} disabled={busy}>
            {busy ? 'Sending…' : 'Email me a link'}
          </PrimaryButton>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>
    </SettingsOverlay>
  );
}

// ---------------------------------------------------------------------------

function ListRow({
  title,
  detail,
  tag,
}: {
  title: string;
  detail?: string;
  tag?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-[12px] px-[14px] py-[11px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <p className="truncate text-[12.5px] font-medium text-[var(--surface-fg)]">{title}</p>
        {detail && <p className="text-[11px] text-[var(--surface-fg-faint)]">{detail}</p>}
      </div>
      {tag}
    </li>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--surface-border)] overflow-hidden rounded-[10px] border border-[var(--surface-border)] bg-[var(--surface-card)]">
      {children}
    </ul>
  );
}

export function ConnectedAccountsOverlay({
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
    <SettingsOverlay
      title="Connected accounts"
      description="Every way you can sign in to CanvasFlow."
      actions={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}
    >
      <List>
        <ListRow
          title="Email and password"
          detail={security.email}
          tag={tag(security.hasPassword, 'Set', 'Not set')}
        />
        <ListRow title="Google" tag={tag(linked('google'), 'Connected', 'Not connected')} />
        <ListRow title="GitHub" tag={tag(linked('github'), 'Connected', 'Not connected')} />
      </List>
      <p className="text-[11px] leading-[1.55] text-[var(--surface-fg-faint)]">
        To connect Google or GitHub, sign in with it using {security.email}. An account with the
        same confirmed email address is joined to this one automatically.
      </p>
    </SettingsOverlay>
  );
}

// ---------------------------------------------------------------------------

export function SessionsOverlay({
  security,
  onClose,
}: {
  security: AccountSecurity;
  onClose: () => void;
}) {
  return (
    <SettingsOverlay
      title="Active sessions"
      description="Where your account is signed in right now. Location is approximate."
      actions={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}
    >
      <List>
        {security.sessions.map((session) => (
          <ListRow
            key={session.id}
            title={session.device ?? 'Unknown browser'}
            detail={`${session.location ?? 'Location unknown'} · Active since ${formatDay(
              session.signedInAt,
            )}`}
            tag={session.current ? <StatusTag tone="positive">This device</StatusTag> : undefined}
          />
        ))}
      </List>
    </SettingsOverlay>
  );
}

// ---------------------------------------------------------------------------

export function SignOutEverywhereOverlay({
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
    <SettingsOverlay
      title="Sign out everywhere?"
      description={`This signs out ${devices}, and closes any board open on them. You'll need to sign in again.`}
      actions={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <DangerButton onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out all'}
          </DangerButton>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>
    </SettingsOverlay>
  );
}
