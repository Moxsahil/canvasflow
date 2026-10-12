'use client';

import { useState, useTransition } from 'react';
import { LoaderCircle } from 'lucide-react';
import { authStyles } from '@/components/auth/auth-shell';
import { cn } from '@/lib/utils';
import { acceptInvite } from './actions';

/**
 * Who is about to join, and the one button that does it.
 *
 * Shown only to the account the invitation is for, so the button can say
 * plainly what it will do.
 */
export function AcceptForm({
  token,
  user,
  label,
}: {
  token: string;
  user: { name: string | null; email: string };
  /** "Join Acme", or "Open Acme" for someone it already let in. */
  label: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shownName = user.name || user.email;

  return (
    <div>
      <SignedInCard name={shownName} email={user.name ? user.email : null} />

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        className={cn(authStyles.submit, 'mt-5 gap-2')}
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            // A successful accept redirects, which throws — so anything that
            // returns here is a failure worth showing.
            const result = await acceptInvite(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
        {label}
      </button>
    </div>
  );
}

/** The share page's "Signed in" card: the account this browser is using. */
export function SignedInCard({ name, email }: { name: string; email: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-medium text-white/80">
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[#F5F4F0]">{name}</p>
        {email && <p className="truncate text-xs text-white/45">{email}</p>}
      </div>
      <span className="cf-eyebrow shrink-0 font-mono text-[10px] uppercase tracking-widest text-white/35">
        Signed in
      </span>
    </div>
  );
}

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return letters || '?';
}
