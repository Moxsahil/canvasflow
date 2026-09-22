'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
import { signup } from '@/features/auth/api/signup';
import { oauthStartUrl, signInWithPassword } from '@/features/auth/api/signin';

/**
 * The same four rules the signup action enforces, written out so nobody has to
 * guess at them. Complexity requirements that only appear as a rejection are
 * how people end up trying the same password five times.
 *
 * The action is still the authority; this list exists to make meeting it easy.
 */
const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { label: 'A capital letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'A number', test: (v) => /[0-9]/.test(v) },
  { label: 'A special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      <div className="space-y-3">
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => {
            window.location.href = oauthStartUrl('google', '/open');
          }}
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => {
            window.location.href = oauthStartUrl('github', '/open');
          }}
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
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
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

        {/* Only once there is something to check — an untouched form should not
            open with a list of things already failed. */}
        {password.length > 0 && (
          <ul className="flex flex-col gap-1 pt-1">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password);
              return (
                <li
                  key={rule.label}
                  className={`flex items-center gap-2 text-xs transition-colors ${
                    met ? 'text-emerald-400' : 'text-white/40'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1 w-1 shrink-0 rounded-full ${
                      met ? 'bg-emerald-400' : 'bg-white/25'
                    }`}
                  />
                  {rule.label}
                </li>
              );
            })}
          </ul>
        )}

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
