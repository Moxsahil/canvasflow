'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeRedirect(searchParams.get('next'), '/open');
  // Set by /verify once an address is confirmed, so the first thing someone
  // sees after clicking the email is that it worked.
  const justVerified = searchParams.get('verified') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentialsSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password');
    } else if (result?.ok) {
      router.push(next);
      router.refresh();
    }
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
      {justVerified && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-3 text-sm text-emerald-300">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          Email confirmed. Sign in to continue.
        </div>
      )}

      <div className="space-y-3">
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => signIn('google', { callbackUrl: next })}
        >
          <GoogleMark />
          Continue with Google
        </button>
        <button
          type="button"
          className={authStyles.provider}
          onClick={() => signIn('github', { callbackUrl: next })}
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
