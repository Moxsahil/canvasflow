'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AuthShell, authStyles } from '@/components/auth/auth-shell';
import { NewPasswordField } from '@/components/auth/new-password-field';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { checkResetToken, completePasswordReset } from '@/features/auth/api/password-reset';
import { meetsPasswordRules } from '@/features/auth/password-rules';
import {
  currentResetToken,
  forgetResetToken,
  rememberEmail,
  restartOnNewResetLink,
  stashResetToken,
  subscribeToNothing,
} from '@/features/auth/reset-handoff';

type Phase =
  | { kind: 'checking' }
  | { kind: 'form'; email: string }
  | { kind: 'done' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'unreachable' };

export function ResetPasswordClient() {
  // Undefined while rendering on the server (no URL fragment exists there),
  // null in the browser when there is no token at all. A pure read, so it can
  // back a render; moving the token out of the address bar happens in the
  // effect below.
  const token = useSyncExternalStore(subscribeToNothing, currentResetToken, () => undefined);

  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Another link opened in this same tab is a fresh start, not a jump within
  // this page. See restartOnNewResetLink.
  useEffect(restartOnNewResetLink, []);

  useEffect(() => {
    if (!token) return;
    // Before any request leaves this page: the token goes into this tab's
    // storage and out of the URL, history and anything that reads the URL.
    stashResetToken(token);

    // Development runs effects twice; the first run's answer is ignored
    // rather than raced. Checking never spends a link, so asking twice is
    // harmless.
    let current = true;
    void (async () => {
      const result = await checkResetToken(token);
      if (!current) return;

      if (result.state === 'valid') {
        setPhase({ kind: 'form', email: result.email });
        return;
      }
      if (result.state !== 'unreachable') forgetResetToken();
      setPhase({ kind: result.state });
    })();

    return () => {
      current = false;
    };
  }, [token, attempt]);

  async function submit(email: string) {
    if (!token) return;
    // The button is already disabled until they match; this covers a submit
    // that arrives some other way, such as Enter in a field.
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    setError(null);

    const result = await completePasswordReset(token, password);
    setSaving(false);

    if (result.ok) {
      forgetResetToken();
      // Offered on the sign-in form next, so the new password goes straight in.
      rememberEmail(email);
      setPassword('');
      setConfirmPassword('');
      setPhase({ kind: 'done' });
      return;
    }

    if (result.reason === 'rejected') {
      setError(result.error);
      return;
    }
    if (result.reason === 'unreachable') {
      // Nothing was spent, so the form stays and the person can try again.
      setError('Could not reach the server. Your link has not been used — try again.');
      return;
    }
    forgetResetToken();
    setPhase({ kind: result.reason });
  }

  // No token at all is answerable before anything is asked. Only while still
  // checking, though: the token is deliberately forgotten once it is spent,
  // and that must not turn "password updated" into "link not valid".
  const view: Phase = token === null && phase.kind === 'checking' ? { kind: 'invalid' } : phase;

  if (view.kind === 'form') {
    return (
      <AuthShell
        label="Password reset"
        heading="Choose a new password."
        sub="You'll be signed out on every device, then you can sign in with the new one."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(view.email);
          }}
          className="space-y-3"
        >
          <p className="text-sm text-white/55">
            For <span className="text-[#F5F4F0]/85">{view.email}</span>
          </p>
          {/* Tells a password manager which saved entry this new password
              replaces. Hidden, because the address is shown just above. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={view.email}
            readOnly
            hidden
          />
          <NewPasswordField
            value={password}
            onChange={setPassword}
            confirmation={confirmPassword}
            onConfirmationChange={setConfirmPassword}
            placeholder="New password"
            confirmPlaceholder="Confirm new password"
            autoFocus
          />

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !meetsPasswordRules(password) || password !== confirmPassword}
            className={authStyles.submit}
          >
            {saving ? (
              <>
                <PencilLoader className="h-7 w-7" />
                <span className="sr-only">Updating password</span>
              </>
            ) : (
              'Update password'
            )}
          </button>
        </form>
      </AuthShell>
    );
  }

  if (view.kind === 'done') {
    return (
      <ResetShell heading="Password updated.">
        <p>You&apos;ve been signed out on all devices. Sign in with your new password.</p>
        <Link href="/login?reset=1" className={cardButton}>
          Sign in
        </Link>
      </ResetShell>
    );
  }

  if (view.kind === 'unreachable') {
    return (
      <ResetShell heading="Couldn't reach the server.">
        <p>Your link hasn&apos;t been used. Check your connection and try again.</p>
        <button
          type="button"
          className={cardButton}
          onClick={() => {
            setPhase({ kind: 'checking' });
            setAttempt((n) => n + 1);
          }}
        >
          Try again
        </button>
      </ResetShell>
    );
  }

  if (view.kind === 'expired' || view.kind === 'invalid') {
    return (
      <ResetShell
        heading={
          view.kind === 'expired' ? 'This link has expired.' : 'This link is no longer valid.'
        }
      >
        <p>
          {view.kind === 'expired'
            ? 'Reset links work for 30 minutes. Ask for a new one and use it soon after it arrives.'
            : 'It may have been used already, or replaced by a newer link. Ask for a new one.'}
        </p>
        <Link href="/forgot-password" className={cardButton}>
          Send a new link
        </Link>
      </ResetShell>
    );
  }

  return (
    <ResetShell heading="Checking your link.">
      <p>One moment.</p>
    </ResetShell>
  );
}

const cardButton =
  'mt-6 inline-flex items-center rounded-lg bg-[#F5F4F0] px-4 py-2.5 text-sm font-medium text-[#020204] transition-opacity hover:opacity-90';

function ResetShell({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <AuthShell
      label="Password reset"
      heading={heading}
      footer={
        <Link href="/login" className={authStyles.link}>
          Back to sign in
        </Link>
      }
    >
      <div aria-live="polite" className="text-sm leading-relaxed text-white/55">
        {children}
      </div>
    </AuthShell>
  );
}
