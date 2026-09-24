'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AuthShell, authStyles } from '@/components/auth/auth-shell';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { requestPasswordReset } from '@/features/auth/api/password-reset';
import { rememberEmail, rememberedEmail, subscribeToNothing } from '@/features/auth/reset-handoff';

/**
 * How long the button waits before offering to send another link. Matches the
 * gateway's one-per-minute limit per address; the gateway is what enforces it,
 * this only saves somebody a refusal.
 */
const RESEND_WAIT_MS = 60_000;

export function ForgotPasswordClient() {
  // Offered from the sign-in form the person just came from, if any. Read
  // through an external store so the server renders an empty field and the
  // browser fills it in without a hydration mismatch.
  const offered = useSyncExternalStore(subscribeToNothing, rememberedEmail, () => '');
  const [typed, setTyped] = useState<string | null>(null);
  const email = typed ?? offered;

  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, startWait] = useCountdown();

  async function send(address: string) {
    setLoading(true);
    setError(null);

    const result = await requestPasswordReset(address);
    setLoading(false);

    if (result.ok) {
      rememberEmail(address);
      setSentTo(address);
      startWait(RESEND_WAIT_MS);
      return;
    }

    setError(result.error);
    if (result.retryAfterSeconds) startWait(result.retryAfterSeconds * 1000);
  }

  if (sentTo) {
    return (
      <AuthShell
        label="Password reset"
        heading="Check your email."
        footer={
          <Link href="/login" className={authStyles.link}>
            Back to sign in
          </Link>
        }
      >
        <div aria-live="polite" className="space-y-4 text-sm leading-relaxed text-white/55">
          {/* Worded so it is true whether or not the address has an account —
              which this page does not know, and must not appear to. */}
          <p>
            If an account exists for <span className="text-[#F5F4F0]/85">{sentTo}</span>, we&apos;ve
            sent a link to reset its password. The link expires in 30 minutes.
          </p>
          <p>
            Didn&apos;t get it? Check your spam folder
            {secondsLeft > 0 ? `, or send another in ${formatWait(secondsLeft)}.` : '.'}
          </p>
          {error && (
            <p role="alert" className="text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            disabled={loading || secondsLeft > 0}
            onClick={() => void send(sentTo)}
            className={authStyles.submit}
          >
            {loading ? <PencilLoader className="h-7 w-7" /> : 'Send another link'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
            className="w-full text-sm text-white/45 transition-colors hover:text-white/80"
          >
            Use a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      label="Password reset"
      heading="Reset your password."
      sub="Enter the email you use for CanvasFlow. We'll send you a link to choose a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className={authStyles.link}>
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(email);
        }}
        className="space-y-3"
      >
        <input
          type="email"
          placeholder="you@example.com"
          aria-label="Email"
          value={email}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="email"
          maxLength={320}
          required
          autoFocus
          className={authStyles.field}
        />

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
            {secondsLeft > 0 ? ` Try again in ${formatWait(secondsLeft)}.` : ''}
          </p>
        )}

        <button type="submit" disabled={loading || secondsLeft > 0} className={authStyles.submit}>
          {loading ? (
            <>
              <PencilLoader className="h-7 w-7" />
              <span className="sr-only">Sending</span>
            </>
          ) : (
            'Send reset link'
          )}
        </button>
      </form>
    </AuthShell>
  );
}

/**
 * Whole seconds left on a wait, ticking once a second while there are any.
 *
 * The clock is read when a wait starts — in the event handler that starts it —
 * and then only inside the interval, so nothing impure runs during render and
 * no state is set while the effect itself runs.
 */
function useCountdown(): [number, (ms: number) => void] {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (until === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until]);

  const start = (ms: number) => {
    const current = Date.now();
    setNow(current);
    setUntil(current + ms);
  };

  const seconds = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
  return [seconds, start];
}

function formatWait(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}
