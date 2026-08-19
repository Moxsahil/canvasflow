import type { Transition, Variants } from 'framer-motion';

/**
 * Rail widths. These mirror `--menu-rail-width` / `--menu-rail-width-expanded`
 * in styles/theme.css, which is what the rest of the left-edge chrome offsets
 * itself by — Framer needs literal, interpolatable values (a `var()` string
 * would snap rather than animate), so the pair is stated in both places.
 */
export const RAIL_WIDTH_COLLAPSED = '3.05rem';
export const RAIL_WIDTH_EXPANDED = '15rem';

export const railTransition: Transition = {
  type: 'tween',
  ease: 'easeOut',
  duration: 0.2,
};

export const railVariants: Variants = {
  open: { width: RAIL_WIDTH_EXPANDED },
  closed: { width: RAIL_WIDTH_COLLAPSED },
};

/** Staggers the labels so they arrive after the rail has started widening. */
export const railContentVariants: Variants = {
  open: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
  closed: {},
};

/**
 * Labels stay mounted and animate out, so collapsing reads as a slide rather
 * than a pop. They carry `aria-hidden` at the call site — the accessible name
 * comes from the button's `aria-label`, which is stable in both states.
 */
export const railLabelVariants: Variants = {
  open: { x: 0, opacity: 1, transition: { x: { stiffness: 1000, velocity: -100 } } },
  closed: { x: -20, opacity: 0, transition: { x: { stiffness: 100 } } },
};
