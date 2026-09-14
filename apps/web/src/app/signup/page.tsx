'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import {
  AuthShell,
  AuthDivider,
  authStyles,
  GoogleMark,
  GitHubMark,
} from '@/components/auth/auth-shell';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { signup } from '@/features/auth/actions/signup';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signup({ name, email, password });
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? 'Signup failed');
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <AuthShell
        label="Almost there"
        heading="Check your email."
        footer={
          <>
            Wrong address?{' '}
            <Link href="/signup" className={authStyles.link}>
              Start again
            </Link>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-white/55">
          We sent a verification link to <span className="text-[#F5F4F0]">{email}</span>. Click it
          to activate your account.
        </p>
        <p className="mt-4 text-sm text-white/35">
          Didn&apos;t receive it? Check your spam folder.
        </p>
      </AuthShell>
    );
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
      <div className="space-y-3">
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => signIn('google', { callbackUrl: '/open' })}
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => signIn('github', { callbackUrl: '/open' })}
        >
          <GitHubMark />
          Continue with GitHub
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
        <input
          type="password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          className={authStyles.field}
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
