import { cn } from '@/lib/utils';
import { SECTION_TYPE } from './section-type';

/**
 * The page's last ask: a heading, one line, and an email box that starts a
 * sign-up with the address already filled in.
 *
 * On the landing page.
 */
export function SignupCta({ id, className }: { id?: string; className?: string }) {
  return (
    <section
      id={id}
      className={cn(
        'bg-[#09090b] py-16 text-[#fafafa] antialiased md:py-32',
        SECTION_TYPE,
        className,
      )}
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-lg text-center" data-reveal="children">
          <h2 data-split className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Sketch, Share and Decide
          </h2>
          <p className="mt-4 text-balance text-[#9f9fa9]">
            Bring your next idea to one live canvas, with your whole team editing beside you.
          </p>
          <form action="/signup" method="get" className="mx-auto my-6 w-full max-w-xs">
            <label htmlFor="cta-email" className="sr-only block text-sm font-medium">
              Your email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                id="cta-email"
                name="email"
                required
                autoComplete="email"
                placeholder="Your email"
                className="flex h-8 w-full min-w-0 rounded-md border border-transparent bg-white/5 px-3 py-1 text-base shadow ring-1 ring-white/10 transition-[color,box-shadow] outline-none placeholder:text-[#9f9fa9]/75 autofill:shadow-[inset_0_0_0_1000px_#1b1b1e] autofill:[-webkit-text-fill-color:#fafafa] autofill:[caret-color:#fafafa] focus-visible:border-white/25 focus-visible:ring-[3px] focus-visible:ring-[#4d84fd]/25 md:text-sm"
              />
              <button
                type="submit"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border-[0.5px] border-transparent bg-[#135dfc] px-3 text-xs font-medium whitespace-nowrap text-white shadow-md ring shadow-black/15 ring-[#4d84fd] transition-transform text-shadow-sm hover:bg-[#135dfc]/90 active:scale-98"
              >
                Get started
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
