'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { TERMS_VERSION } from '@canvasflow/types';
import { AuthDivider, authStyles } from '@/components/auth/auth-shell';
import { TermsAgreement } from '@/components/legal/terms-agreement';
import { cn } from '@/lib/utils';
import { joinAsGuest, joinAsUser } from './actions';

interface JoinFormProps {
  token: string;
  allowGuests: boolean;
  /** Whoever is signed in here, to say who is about to join. Null for nobody. */
  user: { name: string | null; email: string | null } | null;
  /** Where to send someone who chooses to sign in instead. */
  signInHref: string;
}

/**
 * The ways onto a shared board, in the sign-in page's own inputs and buttons —
 * someone who signs in from here goes there and comes straight back, and the
 * two should read as one flow.
 *
 * A signed-in visitor is shown who they are and gets one button. Everyone else
 * is offered the guest path — the point of the whole feature — with signing in
 * kept underneath, because a guest identity is disposable and someone who has
 * an account almost always wants their own.
 */
export function JoinForm({ token, allowGuests, user, signInHref }: JoinFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (user) {
    const shownName = user.name || user.email || 'Your account';
    return (
      <div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-medium text-white/80">
            {initialsOf(shownName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[#F5F4F0]">{shownName}</p>
            {user.name && user.email && (
              <p className="truncate text-xs text-white/45">{user.email}</p>
            )}
          </div>
          <span className="cf-eyebrow shrink-0 font-mono text-[10px] uppercase tracking-widest text-white/35">
            Signed in
          </span>
        </div>

        <ErrorLine error={error} />

        <button
          type="button"
          className={cn(authStyles.submit, 'mt-5 gap-2')}
          disabled={pending}
          aria-busy={pending}
          onClick={() =>
            startTransition(async () => {
              // A successful join redirects, which throws — so anything that
              // returns here is a failure worth showing.
              const result = await joinAsUser(token);
              if (result?.error) setError(result.error);
            })
          }
        >
          {pending && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          Open board
        </button>
      </div>
    );
  }

  if (!allowGuests) {
    return (
      <div>
        <p className="text-sm leading-relaxed text-white/55">
          This board is shared with people who have a CanvasFlow account.
        </p>
        <Link href={signInHref} className={cn(authStyles.submit, 'mt-5')}>
          Sign in to continue
        </Link>
      </div>
    );
  }

  return (
    <div>
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await joinAsGuest(token, formData);
            if (result?.error) setError(result.error);
          })
        }
      >
        <label htmlFor="name" className="mb-2 block text-xs text-white/55">
          Your name
        </label>
        <input
          id="name"
          name="name"
          placeholder="Guest"
          maxLength={40}
          autoFocus
          autoComplete="name"
          className={authStyles.field}
        />
        <p className="mt-2 text-xs text-white/35">
          Shown on your cursor so people know who&rsquo;s who.
        </p>

        <ErrorLine error={error} />

        <button
          type="submit"
          className={cn(authStyles.submit, 'mt-5 gap-2')}
          disabled={pending}
          aria-busy={pending}
        >
          {pending && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}
          Join board
        </button>

        {/* Only on the guest path: a signed-in visitor agreed when their account
            was made, and one who must sign in agrees on the sign-in page. The
            hidden field tells the join which version this form showed. */}
        <input type="hidden" name="termsVersion" value={TERMS_VERSION} />
        <TermsAgreement className={authStyles.agreement} linkClassName={authStyles.link} />
      </form>

      <AuthDivider />

      <Link href={signInHref} className={authStyles.provider}>
        Sign in to join with your account
      </Link>
    </div>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-4 text-sm text-red-400">
      {error}
    </p>
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
