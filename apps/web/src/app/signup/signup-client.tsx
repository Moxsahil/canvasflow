'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { GitHubMark, GoogleMark } from '@/components/auth/auth-shell';
import {
  SplitDivider,
  SplitPasswordInput,
  SplitShell,
  splitStyles,
} from '@/components/auth/split-shell';
import { Component as PencilLoader } from '@/components/ui/loader-1';
import { TermsAgreement } from '@/components/legal/terms-agreement';
import { signup } from '@/features/auth/api/signup';
import { oauthStartUrl, signInWithPassword } from '@/features/auth/api/signin';
import { PASSWORD_RULES } from '@/features/auth/password-rules';
import { safeRedirect } from '@/lib/safe-redirect';
import { cn } from '@/lib/utils';

/**
 * Sign-up in the split frame. It asks for the email first and the rest after,
 * so the page stays one screen tall at any size.
 */
function SignupForm() {
  const searchParams = useSearchParams();
  // Where to go once the account exists. Usually the way into the app; an
  // invitation sends people here with its own page as `next`, and the address
  // it was sent to filled in, since only that address can accept it.
  const next = safeRedirect(searchParams.get('next'), '/open');
  const [step, setStep] = useState<'email' | 'details'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mismatched = confirmPassword.length > 0 && confirmPassword !== password;

  async function handleSubmit(e: FormEvent) {
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
      window.location.href = next;
      return;
    }

    // The account exists either way, so send them somewhere that can say so
    // rather than leaving them on a form that looks like it failed.
    setLoading(false);
    setError('Account created, but signing in failed. Try signing in.');
  }

  return (
    <SplitShell
      heading="Create an Account"
      sub={step === 'email' ? 'Sign up to get started' : email}
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={
              next === '/open' ? '/login' : `/login?${new URLSearchParams({ next }).toString()}`
            }
            className={splitStyles.link}
          >
            Sign in
          </Link>
        </>
      }
    >
      {step === 'email' ? (
        <div className="space-y-5 short:space-y-3">
          <div className="space-y-3 short:space-y-2">
            <button
              type="button"
              className={splitStyles.provider}
              onClick={() => {
                window.location.href = oauthStartUrl('google', next);
              }}
            >
              <GoogleMark />
              Continue with Google
            </button>
            <button
              type="button"
              className={splitStyles.provider}
              onClick={() => {
                window.location.href = oauthStartUrl('github', next);
              }}
            >
              <GitHubMark />
              Continue with GitHub
            </button>
          </div>
          <SplitDivider />
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              setStep('details');
            }}
          >
            <div className="space-y-2.5 short:space-y-1.5">
              <label htmlFor="signup-email" className={splitStyles.label}>
                Email
              </label>
              <input
                type="email"
                id="signup-email"
                required
                autoComplete="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={splitStyles.field}
              />
            </div>
            <button type="submit" className={splitStyles.submit}>
              Continue with Email
            </button>
          </form>
        </div>
      ) : (
        <form className="space-y-4 short:space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-2.5 short:space-y-1.5">
            <label htmlFor="signup-name" className={splitStyles.label}>
              Name
            </label>
            <input
              id="signup-name"
              required
              autoFocus
              autoComplete="name"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={splitStyles.field}
            />
          </div>
          <div className="space-y-2.5 short:space-y-1.5">
            <label htmlFor="signup-password" className={splitStyles.label}>
              Password
            </label>
            <SplitPasswordInput
              id="signup-password"
              placeholder="Choose a password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              minLength={8}
            />
            <SplitPasswordInput
              id="signup-confirm"
              placeholder="Confirm password"
              labelled={false}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              invalid={mismatched}
            />
          </div>
          {/* Only once there is something to check — an untouched form
                    should not open with a list of things already failed. */}
          {password.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1" aria-live="polite">
              {PASSWORD_RULES.map((rule) => (
                <Rule key={rule.label} label={rule.label} met={rule.test(password)} />
              ))}
              {confirmPassword.length > 0 && <Rule label="Passwords match" met={!mismatched} />}
            </ul>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className={splitStyles.submit}>
            {loading ? (
              <>
                <PencilLoader className="h-7 w-7" />
                <span className="sr-only">Creating account</span>
              </>
            ) : (
              'Create account'
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep('email');
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-[#9f9fa9] hover:text-[#fafafa]"
          >
            <ArrowLeft className="size-3.5" />
            Use a different email
          </button>
        </form>
      )}

      {/* Below the form rather than inside it: it covers the provider buttons too. */}
      <TermsAgreement className={splitStyles.agreement} linkClassName={splitStyles.agreementLink} />
    </SplitShell>
  );
}

function Rule({ label: text, met }: { label: string; met: boolean }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 text-xs transition-colors',
        met ? 'text-[#fafafa]' : 'text-[#9f9fa9]',
      )}
    >
      <span
        className={cn('h-1 w-1 shrink-0 rounded-full', met ? 'bg-emerald-400' : 'bg-white/25')}
      />
      {text}
    </li>
  );
}

export function SignupClient() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
