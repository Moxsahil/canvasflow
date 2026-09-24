'use client';

import { Suspense, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AuthShell,
  AuthDivider,
  authStyles,
  GoogleMark,
  GitHubMark,
} from '@/components/auth/auth-shell';
import { PasswordInput } from '@/components/auth/new-password-field';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { safeRedirect } from '@/lib/safe-redirect';
import { oauthStartUrl, signInWithPassword } from '@/features/auth/api/signin';
import { rememberEmail, rememberedEmail, subscribeToNothing } from '@/features/auth/reset-handoff';

/**
 * What the gateway's `?error=` codes mean to a person.
 *
 * Anything unrecognised is left unshown rather than printed raw: the codes are
 * ours, and echoing an arbitrary query parameter into the page is how a
 * convincing fake message gets planted there.
 */
const OAUTH_ERRORS: Record<string, string> = {
  no_email: 'That account did not share an email address, so we could not sign you in.',
  email_unverified: 'Confirm that address with your provider first, then try again.',
  account_disabled: 'That account cannot be signed in to.',
  not_configured: 'That sign-in method is unavailable right now.',
  provider_error: 'That sign-in could not be completed. Please try again.',
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirect(searchParams.get('next'), '/open');

  // Offered from the password-reset pages when the person arrives from one, so
  // the new password goes straight in. Read through an external store so the
  // server renders an empty field and the browser fills it in without a
  // hydration mismatch.
  const offered = useSyncExternalStore(subscribeToNothing, rememberedEmail, () => '');
  const [typed, setTyped] = useState<string | null>(null);
  const email = typed ?? offered;
  const justReset = searchParams.get('reset') === '1';
  const [password, setPassword] = useState('');
  // The OAuth callback cannot render a message, so it says what happened in
  // the URL and this is where it gets read.
  const [error, setError] = useState<string | null>(
    () => OAUTH_ERRORS[searchParams.get('error') ?? ''] ?? null,
  );
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signInWithPassword({ email, password });

    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Invalid email or password');
      return;
    }

    // `refresh` as well as `push`, because the session arrived as a cookie
    // rather than as anything React knows about. Without it the destination
    // renders from a cache built while nobody was signed in.
    router.push(next);
    router.refresh();
  }

  return (
    <AuthShell
      label="Sign in"
      heading="Welcome back."
      sub="Pick up the board you left open."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link href="/signup" className={authStyles.link}>
            Sign up
          </Link>
        </>
      }
    >
      {/* Side by side, named in full for screen readers; the marks and the
          short labels are enough to scan. */}
      <div className={authStyles.providerRow}>
        <button
          type="button"
          aria-label="Continue with Google"
          className={authStyles.provider}
          onClick={() => {
            window.location.href = oauthStartUrl('google', next);
          }}
        >
          <GoogleMark />
          Google
        </button>
        <button
          type="button"
          aria-label="Continue with GitHub"
          className={authStyles.provider}
          onClick={() => {
            window.location.href = oauthStartUrl('github', next);
          }}
        >
          <GitHubMark />
          GitHub
        </button>
      </div>

      <AuthDivider />

      <form onSubmit={handleCredentialsSignIn} className="space-y-3">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="username"
          required
          className={authStyles.field}
        />
        <PasswordInput
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            // Carried to the next page so it does not have to be typed twice.
            onClick={() => rememberEmail(email)}
            className="text-xs text-white/45 transition-colors hover:text-white/80"
          >
            Forgot password?
          </Link>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : (
          justReset && (
            <p role="status" className="text-sm text-emerald-400">
              Password updated. Sign in with your new password.
            </p>
          )
        )}

        <button type="submit" disabled={loading} className={authStyles.submit}>
          {loading ? (
            <>
              <PencilLoader className="h-7 w-7" />
              <span className="sr-only">Signing in</span>
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
