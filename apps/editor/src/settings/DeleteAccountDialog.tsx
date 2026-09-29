import { useEffect, useState, type ReactNode } from 'react';
import { ACCOUNT_DELETION_GRACE_DAYS, SUPPORT_EMAIL } from '@canvasflow/types';
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
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
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
        title="You can’t delete your account yet"
        description="You own a workspace other people belong to. Hand it over or remove them first."
        onClose={onClose}
        actions={
          <SettingsButton variant="primary" onClick={onClose}>
            Done
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
      title="Delete your account?"
      width={460}
      description={
        <>
          Your account is locked and you’re signed out everywhere straight away. Changes you made on
          other people’s boards stay there, shown as “Deleted user”. After{' '}
          {ACCOUNT_DELETION_GRACE_DAYS} days, it’s erased for good. Changed your mind? Write to{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-[var(--surface-fg)] underline underline-offset-2"
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          within {ACCOUNT_DELETION_GRACE_DAYS} days and we’ll stop it.
        </>
      }
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onClose}>
            Cancel
          </SettingsButton>
          {unavailable && (
            <SettingsButton variant="ghost" onClick={onRetry}>
              Try again
            </SettingsButton>
          )}
          {step !== 'sign-in-again' && (
            <SettingsButton variant="danger" type="submit" disabled={!ready}>
              {busy ? 'Deleting…' : 'Delete account'}
            </SettingsButton>
          )}
        </>
      }
    >
      {step === 'sign-in-again' ? (
        <div className="flex flex-col gap-[10px]">
          <Note>
            For your safety, sign in again first. You’ll come straight back here, and then have 10
            minutes to delete your account.
          </Note>
          {providers === null ? (
            <Note>Checking how you sign in…</Note>
          ) : providers.length === 0 ? (
            <ErrorLine>We couldn’t check how you sign in. Close this and try again.</ErrorLine>
          ) : (
            <div className="flex flex-wrap gap-[8px]">
              {providers.map((provider) => (
                <SettingsButton
                  key={provider}
                  variant="primary"
                  onClick={() => signInAgain(provider)}
                >
                  Continue with {providerNames([provider])}
                </SettingsButton>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <label className="flex flex-col gap-[6px] text-[12px] text-[var(--surface-fg-muted)]">
            <span>
              {email ? (
                <>
                  To confirm, type{' '}
                  <strong className="font-semibold text-[var(--surface-fg)]">{email}</strong>
                </>
              ) : (
                'To confirm, type your email address'
              )}
            </span>
            <input
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              aria-label="Type your email address to confirm"
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
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
            </>
          )}
          {step === 'recent' && <Note>No password needed: you signed in a few minutes ago.</Note>}
        </div>
      )}

      {unavailable && <ErrorLine>{loadError}</ErrorLine>}
      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}
