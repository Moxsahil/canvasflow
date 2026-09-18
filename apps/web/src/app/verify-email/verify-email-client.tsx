'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthShell, authStyles } from '@/components/auth/auth-shell';
import { clientEnv } from '@/lib/env.client';

type State = 'working' | 'verified' | 'expired' | 'invalid' | 'unreachable';

export function VerifyEmailClient() {
  const token = useSearchParams().get('token');

  // A link with no token is answerable before anything is asked, so the first
  // render already knows. Deciding it inside the effect would show a
  // "confirming" screen for a beat that never had a chance, and would set
  // state synchronously during an effect, which cascades an extra render.
  const [state, setState] = useState<State>(token ? 'working' : 'invalid');

  // React runs effects twice in development. Without this the first pass
  // spends the token and the second reports it already used — true, but it
  // would change the screen under someone for no reason.
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;

    void (async () => {
      try {
        const res = await fetch(`${clientEnv.NEXT_PUBLIC_API_URL}/auth/email/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          setState('invalid');
          return;
        }

        const body = (await res.json()) as {
          data?: { ok?: boolean; reason?: string };
        };

        if (body.data?.ok) setState('verified');
        else if (body.data?.reason === 'expired') setState('expired');
        else setState('invalid');
      } catch {
        // Nothing was spent, so this is worth retrying — which is a different
        // thing to say than "this link is bad".
        setState('unreachable');
      }
    })();
  }, [token]);

  if (state === 'working') {
    return (
      <VerifyShell heading="Confirming your email">
        <p className="text-sm leading-relaxed text-white/55">One moment.</p>
      </VerifyShell>
    );
  }

  if (state === 'verified') {
    return (
      <VerifyShell
        heading="Email confirmed"
        footer={
          <Link href="/login" className={authStyles.link}>
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm leading-relaxed text-white/55">
          Your address is confirmed. You can carry on where you left off.
        </p>
        <Link
          href="/open"
          className="mt-6 inline-flex items-center rounded-lg bg-[#F5F4F0] px-4 py-2.5 text-sm
                     font-medium text-[#020204] transition-opacity hover:opacity-90"
        >
          Open CanvasFlow
        </Link>
      </VerifyShell>
    );
  }

  if (state === 'unreachable') {
    return (
      <VerifyShell heading="Could not reach the server">
        <p className="text-sm leading-relaxed text-white/55">
          Your link has not been used. Check your connection and open it again.
        </p>
      </VerifyShell>
    );
  }

  return (
    <VerifyShell
      heading={state === 'expired' ? 'This link has expired' : 'This link is not valid'}
      footer={
        <Link href="/login" className={authStyles.link}>
          Back to sign in
        </Link>
      }
    >
      <p className="text-sm leading-relaxed text-white/55">
        {state === 'expired'
          ? 'Verification links are short-lived. Sign in to send yourself a new one.'
          : 'It may have already been used, or been replaced by a newer one.'}
      </p>
    </VerifyShell>
  );
}

function VerifyShell({
  heading,
  children,
  footer,
}: {
  heading: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <AuthShell label="Verification" heading={heading} footer={footer}>
      {children}
    </AuthShell>
  );
}
