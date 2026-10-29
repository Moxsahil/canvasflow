'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { PASSWORD_MAX_LENGTH } from '@/features/auth/password-rules';
import { cn } from '@/lib/utils';
import { splitStyles } from './split-styles';

export { splitStyles };

/** The type the split layout was drawn in: Inter with its alternate letterforms. */
const TYPE =
  "font-[family-name:var(--font-inter-ui)] [font-feature-settings:'cv05','cv10','cv11','ss01']";

const MARK =
  'M34.5 34.5H67.5L58.5 44.5H32V73.5H58.5L50 83H34.5A12 12 0 0 1 22.5 71V46.5A12 12 0 0 1 34.5 34.5ZM73.5 34.5H98.5V44.5H72.5V54.5H98.5L92.5 64.5H72.5V83H63V46.2Z';

/**
 * The frame for signing in and signing up: the form on the left, a quiet
 * panel about CanvasFlow on the right that leaves on narrow screens. Both
 * pages fit one screen at any size — an auth page that scrolls reads as broken
 * — so the gaps tighten on short windows.
 */
export function SplitShell({
  heading,
  sub,
  footer,
  panel = true,
  children,
}: {
  heading: string;
  sub?: string;
  /** The line under the form that points to the other auth page. */
  footer?: ReactNode;
  /**
   * The CanvasFlow panel on the right. Sign-in and sign-up show it; the pages
   * reached from an email leave it out and sit in the middle of the screen.
   */
  panel?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={cn('bg-[#09090b] text-[#fafafa] antialiased', TYPE)}>
      <div className={cn('grid min-h-dvh', panel && 'lg:grid-cols-3')}>
        <div
          className={cn(
            'flex flex-col items-center justify-center p-6 short:py-3',
            panel && 'lg:col-span-2',
          )}
        >
          <div className="m-auto w-full max-w-xs">
            <Link aria-label="CanvasFlow home" className="-ml-2.5 flex size-10 *:m-auto" href="/">
              <svg className="size-6 text-[#4d84fd]" viewBox="20 20 80 80" fill="currentColor">
                <path d={MARK} />
              </svg>
            </Link>
            <div className="mt-6 mb-10 space-y-2 short:mt-2 short:mb-5">
              <h1 className="text-xl font-semibold">{heading}</h1>
              {sub && <p className="text-sm break-words text-[#9f9fa9]">{sub}</p>}
            </div>
            {children}
            {footer && <div className="pt-5 text-sm text-[#9f9fa9] short:pt-3">{footer}</div>}
          </div>
          <div className="mx-auto mt-auto w-full max-w-5xl pt-6 short:pt-3">
            <div className="mx-auto flex max-w-xs items-center gap-6">
              {(
                [
                  ['Privacy', '/privacy'],
                  ['Terms', '/terms'],
                  ['Refunds', '/refunds'],
                ] as const
              ).map(([text, href]) => (
                <Link
                  key={text}
                  className="text-sm text-[#9f9fa9] hover:text-[#fafafa]"
                  href={href}
                >
                  {text}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {panel && (
          <div className="h-dvh py-6 pr-6 max-lg:hidden lg:sticky lg:top-0">
            <div className="relative grid h-full grid-rows-[1fr_auto] gap-32 overflow-hidden rounded-2xl bg-white/[0.02] p-12 inset-ring inset-ring-white/10">
              <div className="relative z-10 mx-auto flex max-w-xs flex-col justify-center">
                <div className="space-y-6">
                  <p className="text-center text-lg text-balance">
                    Brainstorm, plan and present on one live canvas.
                  </p>
                  <div className="space-y-3">
                    <div className="relative mx-auto grid size-8 place-items-center overflow-hidden rounded-full bg-[#135dfc] before:absolute before:inset-0 before:rounded-full before:border before:border-white/25">
                      <svg className="size-4 text-white" viewBox="20 20 80 80" fill="currentColor">
                        <path d={MARK} />
                      </svg>
                    </div>
                    <div className="space-y-1">
                      <p className="text-center text-sm text-balance">CanvasFlow</p>
                      <p className="text-center text-xs text-balance text-white/65">
                        The whiteboard your team shares
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="relative z-10 mx-auto mt-4 flex max-w-xs flex-wrap justify-center gap-x-10 gap-y-6 pb-4 text-sm font-medium text-white/75">
                {['Whiteboard', 'Mind maps', 'AI diagrams', 'Live editing', 'Comments'].map(
                  (feature) => (
                    <span key={feature}>{feature}</span>
                  ),
                )}
              </div>
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-120 bg-[radial-gradient(ellipse_80%_70%_at_50%_100%,rgb(19_93_252/0.45),rgb(19_93_252/0.12)_45%,transparent_75%)]"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/** The "or" rule between the provider buttons and the email form. */
export function SplitDivider() {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 short:py-1">
      <div className="h-0.5 border-b border-[#111113] bg-white/10" />
      <div className="text-center text-sm text-[#9f9fa9]">or</div>
      <div className="h-0.5 border-b border-[#111113] bg-white/10" />
    </div>
  );
}

/** A password field with a show/hide toggle at its end. */
export function SplitPasswordInput({
  id,
  placeholder,
  value,
  onChange,
  autoComplete,
  minLength,
  invalid = false,
  labelled = true,
}: {
  id: string;
  placeholder: string;
  /**
   * Whether a visible `<label>` names the field. One that has none (a confirm
   * field under the same label) is named by its placeholder instead.
   */
  labelled?: boolean;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'current-password';
  minLength?: number;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        placeholder={placeholder}
        aria-label={labelled ? undefined : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={autoComplete === 'new-password' ? PASSWORD_MAX_LENGTH : undefined}
        required
        aria-invalid={invalid}
        className={cn(splitStyles.field, 'pr-10', invalid && 'ring-red-400/50')}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={
          shown ? `Hide ${placeholder.toLowerCase()}` : `Show ${placeholder.toLowerCase()}`
        }
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-white/35 transition-colors hover:text-white/80"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
