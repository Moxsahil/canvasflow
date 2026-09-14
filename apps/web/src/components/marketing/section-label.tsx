import React from 'react';

/**
 * The rule-and-label that opens every section: a short horizontal stroke, then
 * the section's name set small in mono.
 *
 * It carries no margin of its own. Sections space their own header stacks and
 * the pricing block sits tighter than the rest, so the gap belongs to the
 * caller rather than baked in here.
 *
 * `cf-eyebrow` is what puts it in the mono it is drawn in. A font family is
 * inherited already resolved, so the variable has to be set on the same element
 * as the `font-mono` utility reading it — see globals.css.
 */
export function SectionLabel({
  children,
  dark = false,
  className = '',
}: {
  children: React.ReactNode;
  /** Set on the page's dark half so the rule and label read light-on-dark. */
  dark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`cf-eyebrow font-mono inline-flex items-center gap-3 text-sm ${
        dark ? 'text-white/45' : 'text-black/45'
      } ${className}`}
    >
      <span className={`w-12 h-px ${dark ? 'bg-white/30' : 'bg-black/30'}`} />
      {children}
    </span>
  );
}
