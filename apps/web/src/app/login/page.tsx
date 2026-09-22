'use client';

import { Suspense, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AuthShell,
  AuthDivider,
  authStyles,
  GoogleMark,
  GitHubMark,
} from '@/components/auth/auth-shell';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { cn } from '@/lib/utils';
import { safeRedirect } from '@/lib/safe-redirect';
import { oauthStartUrl, signInWithPassword } from '@/features/auth/api/signin';

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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <div className="space-y-3">
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => {
            window.location.href = oauthStartUrl('google', next);
          }}
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => {
            window.location.href = oauthStartUrl('github', next);
          }}
        >
          <GitHubMark />
          Continue with GitHub
        </button>
      </div>

      <AuthDivider />

      <form onSubmit={handleCredentialsSignIn} className="space-y-3">
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={authStyles.field}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            // `pr-12` through cn so it replaces the field's own right padding
            // rather than racing it; the value then runs under the button
            // instead of behind it.
            className={cn(authStyles.field, 'pr-12')}
          />
          <button
            // Not a submit: a bare button inside a form posts it, so revealing
            // the password would send the form.
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-white/35 transition-colors hover:text-white/80 focus:outline-none focus-visible:text-[#F5F4F0]"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
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
