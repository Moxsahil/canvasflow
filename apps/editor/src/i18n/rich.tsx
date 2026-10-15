import { Fragment, type ReactNode } from 'react';

/**
 * A word with markup in it: `t()` leaves a `{{slot}}` it was given no value
 * for, and this puts an element in its place — a bold name, a link — so the
 * sentence around it is still translated whole, in whatever order the
 * language puts it.
 */
export function rich(text: string, slots: Readonly<Record<string, ReactNode>>): ReactNode {
  const parts = text.split(/\{\{(\w+)\}\}/);
  return parts.map((part, index) =>
    // The split puts the slot names at the odd places.
    index % 2 === 1 ? <Fragment key={index}>{slots[part] ?? part}</Fragment> : part,
  );
}
