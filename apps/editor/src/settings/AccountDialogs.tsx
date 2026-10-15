import { useState } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { PASSWORD_MAX_LENGTH, PASSWORD_RULES, meetsPasswordRules } from '@canvasflow/types';
import { cn } from '@/lib/utils';
import { sessionResumeUrl } from '../auth/token';
import { t as translate, useT, type TranslationKey } from '../i18n';
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
    : translate('common.somethingWentWrongRetry');
}

/** The shared rules, in the order they are listed, put into the language on screen. */
const PASSWORD_RULE_KEYS: readonly TranslationKey[] = [
  'password.rule.length',
  'password.rule.capital',
  'password.rule.number',
  'password.rule.special',
];

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
  const t = useT();
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
        aria-label={
          shown
            ? t('password.hide', { label: label.toLowerCase() })
            : t('password.show', { label: label.toLowerCase() })
        }
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
  const t = useT();
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
        title={t('password.changed')}
        description={
          done === 'other-devices'
            ? t('password.changedOthers')
            : signIn
              ? t('password.changedEverywhere')
              : t('password.changedNone')
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
            {signIn ? t('revoked.signIn') : t('common.done')}
          </SettingsButton>
        }
      />
    );
  }

  return (
    <SettingsModal
      title={t('password.changeTitle')}
      description={t('password.changeDescription')}
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </SettingsButton>
          <SettingsButton variant="primary" type="submit" disabled={!ready}>
            {busy ? t('password.changing') : t('password.changeTitle')}
          </SettingsButton>
        </>
      }
    >
      {/* Tells a password manager which saved entry this replaces. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <PasswordField
        label={t('password.current')}
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        autoFocus
      />
      <PasswordField
        label={t('password.new')}
        value={next}
        onChange={setNext}
        autoComplete="new-password"
      />
      <PasswordField
        label={t('password.confirm')}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        invalid={mismatched}
      />

      {next.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-[12px] gap-y-[4px]" aria-live="polite">
          {PASSWORD_RULES.map((rule, index) => {
            const key = PASSWORD_RULE_KEYS[index];
            return (
              <Rule key={rule.label} label={key ? t(key) : rule.label} met={rule.test(next)} />
            );
          })}
          {confirm.length > 0 && <Rule label={t('password.match')} met={!mismatched} />}
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
          {t('password.signOutOthers')}
          <span className="block text-[11px] text-[var(--surface-fg-muted)]">
            {t('password.signOutOthersHint')}
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
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const via = providerNames(security.providers) || t('password.yourProvider');

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
        title={t('password.checkEmail')}
        description={t('password.checkEmailBody', { email: security.email, via })}
        onClose={onClose}
        actions={
          <SettingsButton variant="primary" onClick={onClose}>
            {t('common.done')}
          </SettingsButton>
        }
      />
    );
  }

  return (
    <SettingsModal
      title={t('password.addTitle')}
      description={t('password.addBody', { via, email: security.email })}
      onClose={onClose}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </SettingsButton>
          <SettingsButton variant="primary" onClick={() => void send()} disabled={busy}>
            {busy ? t('common.sending') : t('password.emailLink')}
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
  const t = useT();
  const linked = (provider: 'google' | 'github') => security.providers.includes(provider);
  const tag = (on: boolean, yes: string, no: string) => (
    <StatusTag tone={on ? 'positive' : 'neutral'}>{on ? yes : no}</StatusTag>
  );

  return (
    <SettingsModal
      title={t('settings.row.connected-accounts')}
      description={t('connected.description')}
      onClose={onClose}
      actions={
        <SettingsButton variant="primary" onClick={onClose}>
          {t('common.done')}
        </SettingsButton>
      }
    >
      <DialogList>
        {/* The envelope keeps the three names in one column beside the two marks. */}
        <DialogListRow
          icon={<Mail className="size-[16px] text-[var(--surface-fg-muted)]" aria-hidden="true" />}
          title={t('account.emailAndPassword')}
          detail={security.email}
          tag={tag(security.hasPassword, t('connected.set'), t('account.notSet'))}
        />
        <DialogListRow
          icon={<GoogleMark />}
          title="Google"
          tag={tag(linked('google'), t('connected.connected'), t('connected.notConnected'))}
        />
        <DialogListRow
          icon={<GitHubMark />}
          title="GitHub"
          tag={tag(linked('github'), t('connected.connected'), t('connected.notConnected'))}
        />
      </DialogList>
      <p className="text-[11.5px] leading-[1.55] text-[var(--surface-fg-muted)]">
        {t('connected.howTo', { email: security.email })}
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
  const t = useT();
  return (
    <SettingsModal
      title={t('settings.row.sessions')}
      description={t('sessions.description')}
      onClose={onClose}
      actions={
        <SettingsButton variant="primary" onClick={onClose}>
          {t('common.done')}
        </SettingsButton>
      }
    >
      <DialogList>
        {security.sessions.map((session) => (
          <DialogListRow
            key={session.id}
            title={session.device ?? t('sessions.unknownBrowser')}
            detail={`${session.location ?? t('sessions.unknownLocation')} · ${t(
              'sessions.activeSince',
              {
                date: formatDay(session.signedInAt),
              },
            )}`}
            tag={
              session.current ? (
                <StatusTag tone="positive">{t('sessions.thisDevice')}</StatusTag>
              ) : undefined
            }
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
  const t = useT();
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
    deviceCount > 1
      ? t('signOutAll.allDevices', { count: deviceCount })
      : t('signOutAll.thisDevice');

  return (
    <SettingsModal
      title={t('signOutAll.title')}
      description={t('signOutAll.body', { devices })}
      onClose={onClose}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </SettingsButton>
          <SettingsButton variant="danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? t('signOutAll.busy') : t('account.signOutAll')}
          </SettingsButton>
        </>
      }
    >
      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}
