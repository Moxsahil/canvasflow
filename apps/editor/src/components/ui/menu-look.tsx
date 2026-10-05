import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Square, SquareCheck } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The editor's menu look, shared by the context menu and the sidebar's
 * dropdowns so the three cannot drift apart: a bordered sheet of compact rows
 * with a hair of space between each, label on the left and icon on the right,
 * in a neutral palette that follows `[data-theme='dark']` on `.cf-editor`.
 *
 * Each menu adds its own height cap, since Radix names the room it reports
 * after the kind of menu it is.
 *
 * Solid in the light theme where the design this follows is a faint tint: a
 * menu floats over the board, and a see-through one over a busy board is one
 * you cannot read. The neutral-50 it uses is what that tint comes to over
 * white.
 */
export const menuSurfaceClasses =
  'rounded-lg border border-neutral-300 bg-neutral-50 text-neutral-950 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50';

/**
 * A 28px button on a bar in the menu look — the floating style bar's chips,
 * and the link box's. It lights on hover, on keyboard focus, and while the
 * menu it opens is open or the state it stands for is on.
 */
export const menuChipClasses =
  'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium tabular-nums outline-none hover:bg-neutral-950/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) aria-expanded:bg-neutral-950/10 aria-pressed:bg-neutral-950/10 dark:hover:bg-neutral-50/10 dark:aria-expanded:bg-neutral-50/10 dark:aria-pressed:bg-neutral-50/10 [&_svg]:size-4';

/** The surface laid out as a menu: a column of rows, sized to its longest. */
export const menuPanelClasses = `z-(--zIndex-popup) flex w-max max-w-72 min-w-52 flex-col items-start gap-y-1 overflow-y-auto p-1 outline-none ${menuSurfaceClasses}`;

/** Highlight covers pointer and keyboard alike, since Radix moves both through it. */
export const menuRowClasses =
  'relative flex w-full cursor-default select-none items-center justify-between gap-3 rounded px-2 py-1.5 text-xs outline-none active:bg-neutral-50/15 data-[highlighted]:bg-neutral-950/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 dark:data-[highlighted]:bg-neutral-50/10';

/**
 * A row that deletes or discards, as the context menu's Delete draws it: red
 * text, and on highlight the two reds that row stacks (a tint and an overlay)
 * as one — 14.5% in light, 40% in dark.
 */
export const menuDangerRowClasses =
  'text-red-400 data-[highlighted]:bg-red-500/[14.5%] dark:data-[highlighted]:bg-red-500/40';

/** The same red for a row that lights on hover and focus rather than on Radix's highlight. */
export const menuDangerButtonClasses =
  'text-red-400 hover:bg-red-500/[14.5%] hover:text-red-400 focus-visible:bg-red-500/[14.5%] dark:hover:bg-red-500/40 dark:focus-visible:bg-red-500/40';

/**
 * The same row for a plain button outside a Radix menu, which lights on hover
 * and on keyboard focus rather than on Radix's highlight.
 */
export const menuButtonRowClasses =
  'relative flex w-full cursor-default select-none items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-xs outline-none hover:bg-neutral-950/10 focus-visible:bg-neutral-950/10 active:bg-neutral-50/15 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-neutral-50/10 dark:focus-visible:bg-neutral-50/10';

/**
 * The panel for a popover that wears the menu look. A popover brings its own
 * shadow and entrance animation, which the menus have neither of.
 */
export const menuPopoverClasses = `${menuPanelClasses} shadow-none data-[state=open]:animate-none`;

/** A row whose list is open beside it stays lit while you are in that list. */
export const menuSubTriggerClasses =
  'data-[state=open]:bg-neutral-950/10 dark:data-[state=open]:bg-neutral-50/10';

export const menuSeparatorClasses = 'h-px w-full shrink-0 bg-neutral-300 dark:bg-neutral-600';

export const menuLabelClasses =
  'w-full truncate px-2 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400';

/** The slide a label or a box takes when it swaps for another. */
export const menuSlide = {
  initial: { y: -10, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 10, opacity: 0 },
};

/** Where a row's icon sits, sized the same whether it holds a glyph or a dot. */
export function MenuRowIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:size-4">
      {children}
    </span>
  );
}

/** What sits at the right-hand end of a row: an optional tag, then the icon. */
export function MenuRowEnd({ badge, icon }: { badge?: React.ReactNode; icon?: React.ReactNode }) {
  if (!badge && !icon) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {badge}
      {icon && <MenuRowIcon>{icon}</MenuRowIcon>}
    </span>
  );
}

/** A small tag before a row's icon — "Soon", for a row not built yet. */
export function MenuBadge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('text-[10px] text-neutral-500 dark:text-neutral-400', className)}
      {...props}
    />
  );
}

/**
 * A moment's press, for a box that has just been ticked: it dips from its
 * resting size and springs back.
 */
export function useMenuPress(): [pressed: boolean, press: () => void] {
  const [pressed, setPressed] = React.useState(false);

  React.useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => setPressed(false), 100);
    return () => clearTimeout(timer);
  }, [pressed]);

  return [pressed, React.useCallback(() => setPressed(true), [])];
}

/** The on/off box at the end of a toggle row. It slides to its new state. */
export function MenuToggleBox({ checked, pressed }: { checked: boolean; pressed: boolean }) {
  return (
    <motion.span
      className="relative flex size-4 shrink-0 items-center justify-center"
      animate={{ scale: pressed ? 1 : 1.1 }}
    >
      <AnimatePresence>
        <motion.span
          key={checked ? 'on' : 'off'}
          {...menuSlide}
          className="absolute inset-0 flex items-center justify-center [&>svg]:size-4"
        >
          {checked ? <SquareCheck /> : <Square />}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}
