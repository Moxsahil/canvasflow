import React from 'react';
import Link from 'next/link';

/**
 * The frame every auth screen sits in, so sign in, sign up and verification
 * read as one flow rather than three pages that happen to be adjacent.
 *
 * It borrows the landing page's dark half outright — the same #020204 ground,
 * the same #F5F4F0 ink, the same hairline card — and `cf-auth` brings the faces
 * and palette the pricing and closing sections already use (see globals.css),
 * so someone arriving from the marketing page does not cross a visual seam on
 * the way to signing in.
 */
export function AuthShell({
  label,
  heading,
  sub,
  children,
  footer,
}: {
  /** The small rule-and-name that opens the card, as on the landing sections. */
  label: string;
  heading: string;
  sub?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="cf-auth font-sans min-h-screen bg-[#020204] text-[#F5F4F0] flex flex-col items-center justify-center px-6 py-12">
      <Link
        href="/"
        className="mb-10 text-xl tracking-tight text-[#F5F4F0]/90 transition-colors hover:text-[#F5F4F0]"
      >
        CanvasFlow
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8">
        <span className="cf-eyebrow font-mono inline-flex items-center gap-3 text-sm text-white/45">
          <span className="h-px w-12 bg-white/30" />
          {label}
        </span>

        <h1 className="mt-5 text-3xl font-light leading-[1.1] tracking-tight">{heading}</h1>
        {sub && <p className="mt-3 text-sm leading-relaxed text-white/45">{sub}</p>}

        <div className="mt-8">{children}</div>
      </div>

      {footer && <div className="mt-8 text-sm text-white/40">{footer}</div>}
    </main>
  );
}

/**
 * Inputs, buttons and the divider, kept here so the two forms cannot drift.
 *
 * The focused border is plain `focus`, not `focus-visible`: a text input
 * matches `:focus-visible` however focus arrived, by spec, because someone
 * needs to see where their typing will land. So the two are the same thing
 * here, and the shorter one says so.
 *
 * Which is why an autofilled field is quietened in globals.css instead. The
 * browser leaves the field focused after filling it, so it lit up while the
 * ones beside it stayed dim — reading as a validation state rather than as
 * "this one is already filled in". Type into it and the browser drops the
 * autofill state, so the focus border comes straight back.
 */
export const authStyles = {
  field:
    'w-full rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-[#F5F4F0] placeholder:text-white/25 transition-colors focus:border-white/35 focus:outline-none',
  provider:
    'flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 px-4 py-3 text-sm text-white/70 transition-all duration-200 hover:border-white/30 hover:bg-white/[0.06] hover:text-white',
  submit:
    'flex h-[46px] w-full items-center justify-center rounded-xl bg-[#F5F4F0] px-4 text-sm font-medium text-[#020204] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50',
  link: 'text-[#F5F4F0]/80 underline underline-offset-4 transition-colors hover:text-[#F5F4F0]',
} as const;

/**
 * The two provider marks, drawn inline rather than fetched.
 *
 * Google's is the four-colour G, which is what its brand terms ask for and the
 * shape people scan for; it keeps its own colours on any ground. GitHub's is a
 * single silhouette, so it takes `currentColor` and travels with the button —
 * including the lift from white/70 to white on hover.
 *
 * `aria-hidden` on both: the button already says which provider it is, and a
 * screen reader should not hear the name twice.
 */
export function GoogleMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function GitHubMark({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23a11.5 11.5 0 0 1 3-.405c1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

/** The "or" rule between the providers and the credentials form. */
export function AuthDivider() {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-white/[0.08]" />
      <span className="cf-eyebrow font-mono text-[11px] uppercase tracking-widest text-white/30">
        or
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}
