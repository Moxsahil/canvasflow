'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AuthShell,
  AuthDivider,
  authStyles,
  GoogleMark,
  GitHubMark,
} from '@/components/auth/auth-shell';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { NewPasswordField } from '@/components/auth/new-password-field';
import { signup } from '@/features/auth/api/signup';
import { oauthStartUrl, signInWithPassword } from '@/features/auth/api/signin';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Caught here rather than by the gateway, which is only ever sent one copy:
    // a mistyped password is the person's mistake to fix, not a request to make.
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await signup({ name, email, password });

    if (!result.ok) {
      setLoading(false);
      setError(result.error ?? 'Signup failed');
      return;
    }

    // Straight onto a board rather than a page telling them to go and read
    // their inbox. Signing in has never required a confirmed address, so the
    // account that was just created can hold a session immediately, and the
    // verification mail is already on its way.

    const signedIn = await signInWithPassword({ email, password });

    if (signedIn.ok) {
      // A full navigation, not the router: /open answers with a redirect to the
      // editor on another origin, which a client-side navigation cannot follow.
      window.location.href = '/open';
      return;
    }

    // The account exists either way, so send them somewhere that can say so
    // rather than leaving them on a form that looks like it failed.
    setLoading(false);
    setError('Account created, but signing in failed. Try signing in.');
  }

  return (
    <AuthShell
      label="Create account"
      heading="Start with a blank canvas."
      sub="Free forever for personal use."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className={authStyles.link}>
            Sign in
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
            window.location.href = oauthStartUrl('google', '/open');
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
            window.location.href = oauthStartUrl('github', '/open');
          }}
        >
          <GitHubMark />
          GitHub
        </button>
      </div>

      <AuthDivider />

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={authStyles.field}
        />
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={authStyles.field}
        />
        <NewPasswordField
          value={password}
          onChange={setPassword}
          confirmation={confirmPassword}
          onConfirmationChange={setConfirmPassword}
        />

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={authStyles.submit}>
          {loading ? (
            <>
              <PencilLoader className="h-7 w-7" />
              <span className="sr-only">Creating account</span>
            </>
          ) : (
            'Create account'
          )}
        </button>
      </form>
    </AuthShell>
  );
}
