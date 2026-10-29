'use client';

/**
 * The footer's newsletter sign-up. There is no list to join yet, so submitting
 * goes nowhere and stores nothing; it gets a handler when the app has one.
 */
export function NewsletterForm() {
  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      className="ml-auto w-full space-y-4 md:max-w-xs"
    >
      <label htmlFor="footer-email" className="block text-sm font-medium">
        Subscribe to our newsletter
      </label>
      <div className="flex gap-2">
        <input
          type="email"
          id="footer-email"
          name="email"
          required
          autoComplete="email"
          placeholder="Your email"
          className="flex h-8 w-full min-w-0 rounded-md border border-transparent bg-white/5 px-3 py-1 text-base shadow ring-1 ring-white/10 transition-[color,box-shadow] outline-none placeholder:text-[#9f9fa9]/75 autofill:shadow-[inset_0_0_0_1000px_#1b1b1e] autofill:[-webkit-text-fill-color:#fafafa] autofill:[caret-color:#fafafa] focus-visible:border-white/25 focus-visible:ring-[3px] focus-visible:ring-[#4d84fd]/25 md:text-sm"
        />
        <button
          type="submit"
          className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-[0.5px] border-transparent bg-[#135dfc] px-3 text-xs font-medium whitespace-nowrap text-white shadow-md ring shadow-black/15 ring-[#4d84fd] transition-transform text-shadow-sm hover:bg-[#135dfc]/90 active:scale-98"
        >
          Subscribe
        </button>
      </div>
      <p className="text-xs text-[#9f9fa9]">
        Get the latest product news and behind the scenes updates. Unsubscribe at any time.
      </p>
    </form>
  );
}
