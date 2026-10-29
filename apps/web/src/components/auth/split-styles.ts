/**
 * Inputs, labels and buttons for forms inside the split frame.
 *
 * In a module of its own, not beside the frame: the frame is a client
 * component, and a plain object exported from a client module reaches a
 * server component as a reference, not as its value, so the server-rendered
 * pages that style their buttons with these would get nothing.
 */
export const splitStyles = {
  provider:
    'inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[#111113] px-4 py-2 text-sm font-medium whitespace-nowrap shadow-sm ring-1 shadow-black/10 ring-white/15 transition-transform duration-200 hover:bg-[#27272a]/50 active:scale-98 [&_svg]:size-4',
  submit:
    'inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md border-[0.5px] border-transparent bg-[#135dfc] px-4 py-2 text-sm font-medium whitespace-nowrap text-white shadow-md ring shadow-black/15 ring-[#4d84fd] transition-transform text-shadow-sm hover:bg-[#135dfc]/90 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60',
  field:
    'flex h-9 w-full min-w-0 rounded-md border border-transparent bg-white/5 px-3 py-1 text-base shadow-sm ring-1 ring-white/10 transition-[color,box-shadow] outline-none placeholder:text-[#9f9fa9]/75 autofill:shadow-[inset_0_0_0_1000px_#1b1b1e] autofill:[-webkit-text-fill-color:#fafafa] focus-visible:border-white/25 focus-visible:ring-[3px] focus-visible:ring-[#4d84fd]/25 md:text-sm',
  label: 'block text-sm leading-none font-medium',
  link: 'font-medium text-[#4d84fd] hover:underline',
  quietLink: 'text-[#9f9fa9] transition-colors hover:text-[#fafafa]',
  agreement: 'mt-5 text-xs leading-relaxed text-[#9f9fa9] short:mt-3',
  agreementLink: 'text-[#fafafa] underline-offset-2 hover:underline',
} as const;
