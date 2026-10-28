import { useEffect, useState, type ReactNode } from 'react';
import { ACCOUNT_DELETION_GRACE_DAYS, PLAN_NAMES, SUPPORT_EMAIL } from '@canvasflow/types';
import { formatDay } from '../billing/UpgradeShell';
import { rich, t as translate, useT } from '../i18n';
import { PasswordField } from './AccountDialogs';
import {
  AccountDeletionError,
  signInAgainUrl,
  type DeletionInput,
  type DeletionPreview,
} from './account-deletion-api';
import { deletionStep, readyToDelete, rememberDeletionResume } from './account-deletion';
import { providerNames } from './account-format';
import { fetchAccountSecurity, type SignInProvider } from './account-security-api';
import { ErrorLine, INPUT, SettingsButton, SettingsModal } from './settings-ui';

/**
 * Deleting your own account: the dialog Delete account opens on Data & Privacy.
 *
 * One paragraph says what happens — locked at once, history on other people's
 * boards kept as "Deleted user", erased after the grace period, and how to stop
 * it before then — and then it asks for two things: the account's address typed
 * out, which is how somebody says they mean it, and proof it is really them:
 * the password, or for an account with none, a sign-in moments ago. The gateway
 * checks both again; nothing here is what keeps an account safe.
 *
 * It opens at once. The paragraph needs nothing loaded, and which proof applies
 * comes from a preview the pane fetches as it opens, so by the time anyone
 * reaches the button it is usually here already; until it is, only the typing
 * is offered and nothing can be sent.
 */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : translate('common.somethingWentWrongRetry');
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-[1.55] text-[var(--surface-fg-muted)]">{children}</p>;
}

export function DeleteAccountDialog({
  token,
  userId,
  preview,
  loadError,
  fallbackEmail,
  onRetry,
  onClose,
  deleteAccount,
}: {
  token: string | null;
  /** Who is asking, so coming back from signing in again reopens this only for them. */
  userId: string | null;
  /** What the gateway says about deleting this account. Null while it loads. */
  preview: DeletionPreview | null;
  /** Why the preview could not be loaded, when it could not. */
  loadError: string | null;
  /** The address from the profile, to show while the preview is on its way. */
  fallbackEmail: string | null;
  onRetry: () => void;
  onClose: () => void;
  /**
   * Send the request, and on success leave. Owned by the editor rather than
   * made here, because every session ends as part of it and the editor has to
   * know that is coming before the sync-server tells it.
   */
  deleteAccount: (input: DeletionInput) => Promise<void>;
}) {
  const t = useT();
  const [providers, setProviders] = useState<SignInProvider[] | null>(null);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The gateway can find the sign-in too old even when it was recent enough
  // as the dialog opened: this is how the dialog learns that.
  const [signInLapsed, setSignInLapsed] = useState(false);

  const step = preview ? (signInLapsed ? 'sign-in-again' : deletionStep(preview)) : null;

  // Only needed to offer the ways back in, so only fetched then.
  useEffect(() => {
    if (step !== 'sign-in-again' || providers !== null) return;
    let cancelled = false;
    fetchAccountSecurity(token).then(
      (security) => {
        if (!cancelled) setProviders(security.providers);
      },
      () => {
        if (!cancelled) setProviders([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [step, providers, token]);

  if (step === 'blocked') {
    return (
      <SettingsModal
        title={t('deleteAccount.blockedTitle')}
        description={t('deleteAccount.blockedBody')}
        onClose={onClose}
        actions={
          <SettingsButton variant="primary" onClick={onClose}>
            {t('common.done')}
          </SettingsButton>
        }
      />
    );
  }

  const email = preview?.email ?? fallbackEmail;
  const ready =
    preview !== null &&
    step !== null &&
    readyToDelete({ step, typed, email: preview.email, password, busy });

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({
        confirmEmail: typed,
        ...(step === 'password' ? { currentPassword: password } : {}),
      });
      // Left busy: the editor is navigating away from here.
    } catch (caught) {
      if (caught instanceof AccountDeletionError && caught.code === 'recent-sign-in-required') {
        setSignInLapsed(true);
      } else {
        setError(messageOf(caught));
      }
      setBusy(false);
    }
  };

  const signInAgain = (provider: SignInProvider) => {
    if (userId) rememberDeletionResume(userId);
    window.location.href = signInAgainUrl(provider);
  };

  const unavailable = !preview && loadError;

  return (
    <SettingsModal
      title={t('deleteAccount.title')}
      width={460}
      description={rich(t('deleteAccount.body', { days: ACCOUNT_DELETION_GRACE_DAYS }), {
        email: (
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-[var(--surface-fg)] underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>
        ),
      })}
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </SettingsButton>
          {unavailable && (
            <SettingsButton variant="ghost" onClick={onRetry}>
              {t('common.tryAgain')}
            </SettingsButton>
          )}
          {step !== 'sign-in-again' && (
            <SettingsButton variant="danger" type="submit" disabled={!ready}>
              {busy ? t('common.deleting') : t('settings.row.delete-account')}
            </SettingsButton>
          )}
        </>
      }
    >
      {step === 'sign-in-again' ? (
        <div className="flex flex-col gap-[10px]">
          <Note>{t('deleteAccount.signInAgain')}</Note>
          {providers === null ? (
            <Note>{t('deleteAccount.checking')}</Note>
          ) : providers.length === 0 ? (
            <ErrorLine>{t('deleteAccount.checkFailed')}</ErrorLine>
          ) : (
            <div className="flex flex-wrap gap-[8px]">
              {providers.map((provider) => (
                <SettingsButton
                  key={provider}
                  variant="primary"
                  onClick={() => signInAgain(provider)}
                >
                  {t('deleteAccount.continueWith', { provider: providerNames([provider]) })}
                </SettingsButton>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {preview?.paidPlans?.map((paid) => (
            <Note key={paid.workspaceName}>
              {paid.endsAt
                ? t('deleteAccount.planEnds', {
                    name: paid.workspaceName,
                    plan: planName(paid.plan),
                    date: formatDay(new Date(paid.endsAt)),
                  })
                : t('deleteAccount.planEndsNoDate', {
                    name: paid.workspaceName,
                    plan: planName(paid.plan),
                  })}
            </Note>
          ))}
          <label className="flex flex-col gap-[6px] text-[12px] text-[var(--surface-fg-muted)]">
            <span>
              {email
                ? rich(t('delete.typeToConfirm'), {
                    name: (
                      <strong className="font-semibold text-[var(--surface-fg)]">{email}</strong>
                    ),
                  })
                : t('deleteAccount.typeEmail')}
            </span>
            <input
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-label={t('deleteAccount.typeEmailLabel')}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              className={INPUT}
            />
          </label>

          {step === 'password' && (
            <>
              {/* Tells a password manager which saved entry to offer. */}
              <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
              <PasswordField
                label={t('settings.row.password')}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
            </>
          )}
          {step === 'recent' && <Note>{t('deleteAccount.recent')}</Note>}
        </div>
      )}

      {unavailable && <ErrorLine>{loadError}</ErrorLine>}
      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}

function planName(plan: string): string {
  return (PLAN_NAMES as Record<string, string>)[plan] ?? plan;
}
