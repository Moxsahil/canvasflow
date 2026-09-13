import React from 'react';

/** The small uppercase pill that labels each section. */
export function Tag({
  children,
  dark = false,
}: {
  children: React.ReactNode;
  /** Set on the page's dark half so the pill reads light-on-dark. */
  dark?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] tracking-widest font-sans ${
        dark ? 'text-white/45 bg-white/[0.06]' : 'text-black/40 bg-black/[0.04]'
      }`}
    >
      {children}
    </span>
  );
}
