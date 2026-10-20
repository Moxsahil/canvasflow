import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

/**
 * The sign-in frame: the form on the left, a picture of the night sky with one
 * line about the product on the right.
 *
 * The panel is decoration, so it drops out below `md` and the form takes the
 * whole width. The gaps between rows grow and shrink with the window's height
 * (the `--sa-*` spacing in globals.css), so the page fits without a scrollbar
 * from a laptop at 125% scaling up to a tall monitor, where they reach the
 * spacing the design was drawn at.
 *
 * Breakpoints past `md` are written in rem: Tailwind only orders breakpoints
 * that share a unit, and a px one landed before `md` and lost to it.
 */
export function SplitAuthShell({
  heading,
  sub,
  children,
  footer,
}: {
  heading: string;
  sub?: string;
  children: React.ReactNode;
  /** The line under the form that points to the other auth page. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-black p-1">
      <main className="cf-split-auth flex min-h-[calc(100dvh-8px)] overflow-hidden rounded-[18px] bg-[#090909] font-[Arial,Helvetica,sans-serif] text-sm text-[#f4f4f5]">
        <section
          aria-label="Account access"
          className="flex w-full flex-col items-center px-7 md:w-[58%] md:px-8 min-[56.3125rem]:w-2/3"
        >
          <div className="w-full max-w-[322px] pt-(--sa-top)">
            <Link href="/" aria-label="CanvasFlow home" className="mb-(--sa-mark) inline-flex">
              <CanvasFlowMark className="h-5 w-auto" />
            </Link>

            <header>
              <h1 className="text-xl font-semibold leading-7 tracking-[-0.55px]">{heading}</h1>
              {sub && <p className="mt-[7px] leading-5 text-[#a1a1aa]">{sub}</p>}
            </header>

            <div className="mt-(--sa-providers)">{children}</div>

            {footer && <p className="mt-(--sa-switch) text-[#a1a1aa]">{footer}</p>}
          </div>

          <footer className="mt-auto flex w-[322px] max-w-full gap-[25px] pb-(--sa-footer-end) pt-(--sa-footer) text-[#a1a1aa]">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
          </footer>
        </section>

        <aside className="relative isolate my-6 mr-6 hidden flex-1 flex-col items-center overflow-hidden rounded-[20px] border border-[#202020] bg-[#0d0d0f] pb-36 md:flex">
          <div
            className="absolute inset-x-0 bottom-0 top-[40%] -z-10 opacity-65"
            aria-hidden="true"
          >
            <Image
              src="/images/sign-in-night.jpg"
              alt=""
              fill
              sizes="(min-width: 56.3125rem) 34vw, 42vw"
              className="object-cover object-bottom"
              priority
            />
            <div className="absolute inset-0 bg-linear-to-b from-[#0d0d0f] to-transparent to-45%" />
          </div>

          <figure className="mx-7 my-auto -translate-y-10 pt-10 text-center">
            <p className="text-lg font-medium leading-7 tracking-[-0.4px] max-[56.3125rem]:text-[17px]">
              Sketch it out, share the link,
              <br className="hidden xl:block" /> and work it through together.
            </p>
            <span className="mx-auto mb-3 mt-[26px] flex size-8 items-center justify-center rounded-full border border-[#a3a3a3] bg-white text-[#181818]">
              <CanvasFlowMark className="h-3 w-auto" />
            </span>
            <figcaption className="flex flex-col gap-[3px] font-medium">
              <span>CanvasFlow</span>
              <small className="text-xs text-[#a1a1aa]">The online whiteboard for teams</small>
            </figcaption>
          </figure>
        </aside>
      </main>
    </div>
  );
}

/** Inputs, labels, buttons and links for forms inside the split frame. */
export const splitAuthStyles = {
  label: 'text-sm font-medium',
  field:
    'h-[38px] w-full rounded-[9px] border border-[#242424] bg-[#161616] px-[13px] text-sm text-[#f4f4f5] placeholder:text-[#a1a1aa] transition-colors outline-none focus:border-[#847aff] focus:ring-3 focus:ring-[#847aff]/50',
  provider:
    'flex h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-[9px] border border-[#303030] text-sm font-medium transition-colors hover:bg-[#161616] focus-visible:border-[#847aff] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#847aff]/50',
  submit:
    'flex h-[38px] w-full cursor-pointer items-center justify-center rounded-[9px] border border-[#8278ff] bg-[#6256ff] text-sm font-medium text-white transition hover:brightness-115 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#847aff]/50 disabled:cursor-not-allowed disabled:opacity-50',
  link: 'text-[#8278ff] hover:underline',
  /** The terms line under the form. */
  agreement: 'mt-(--sa-terms) text-xs leading-relaxed text-[#a1a1aa]',
  agreementLink: 'text-[#f4f4f5] underline underline-offset-4 hover:text-white',
} as const;

/** The "or" rule between the providers and the credentials form. */
export function SplitAuthDivider() {
  return (
    <div className="relative my-(--sa-divider) h-5 text-sm">
      <span className="absolute inset-x-0 top-1/2 h-px bg-[#292929]" />
      <span className="relative mx-auto block w-fit bg-[#090909] px-2 text-[#a1a1aa]">or</span>
    </div>
  );
}

/** The CF letters from the site icon, cropped to the glyph and drawn in `currentColor`. */
function CanvasFlowMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="22 34 77 49.5" fill="currentColor" aria-hidden="true">
      <path d="M34.5 34.5H67.5L58.5 44.5H32V73.5H58.5L50 83H34.5A12 12 0 0 1 22.5 71V46.5A12 12 0 0 1 34.5 34.5ZM73.5 34.5H98.5V44.5H72.5V54.5H98.5L92.5 64.5H72.5V83H63V46.2Z" />
    </svg>
  );
}
