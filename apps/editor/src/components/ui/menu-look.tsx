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
  'rounded-xl border border-neutral-300 bg-neutral-50 text-neutral-950 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50';

/**
 * A 28px button on a bar in the menu look — the floating style bar's chips,
 * and the link box's. It lights on hover, on keyboard focus, and while the
 * menu it opens is open or the state it stands for is on.
 */
export const menuChipClasses =
  'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-xs font-medium tabular-nums outline-none hover:bg-neutral-950/10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) aria-expanded:bg-neutral-950/10 aria-pressed:bg-neutral-950/10 dark:hover:bg-neutral-50/10 dark:aria-expanded:bg-neutral-50/10 dark:aria-pressed:bg-neutral-50/10 [&_svg]:size-4';

/** The surface laid out as a menu: a column of rows, sized to its longest. */
export const menuPanelClasses = `z-(--zIndex-popup) flex w-max max-w-72 min-w-52 flex-col items-start gap-y-0.5 overflow-y-auto p-1.5 outline-none ${menuSurfaceClasses}`;

/** Highlight covers pointer and keyboard alike, since Radix moves both through it. */
export const menuRowClasses =
  'relative flex min-h-[30px] w-full cursor-default select-none items-center justify-between gap-5 rounded-md px-2 py-1.5 text-xs outline-none active:bg-neutral-50/15 data-[disabled]:pointer-events-none data-[disabled]:opacity-40';

/**
 * A row that deletes or discards, as the context menu's Delete draws it: red
 * text, and a red highlight — 14.5% in light, 40% in dark.
 */
export const menuDangerRowClasses = 'text-red-600 dark:text-red-400';

/** The same red for a row that lights on hover and focus rather than on Radix's highlight. */
export const menuDangerButtonClasses =
  'text-red-600 hover:bg-red-500/[12%] hover:text-red-600 focus-visible:bg-red-500/[12%] dark:text-red-400 dark:hover:bg-red-500/20 dark:hover:text-red-400 dark:focus-visible:bg-red-500/20';

/**
 * The same row for a plain button outside a Radix menu, which lights on hover
 * and on keyboard focus rather than on Radix's highlight.
 */
export const menuButtonRowClasses =
  'relative flex w-full cursor-default select-none items-center justify-between gap-5 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-neutral-950/10 focus-visible:bg-neutral-950/10 active:bg-neutral-50/15 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-neutral-50/10 dark:focus-visible:bg-neutral-50/10';

/**
 * The panel for a popover that wears the menu look. A popover brings its own
 * shadow and entrance animation, which the menus have neither of.
 */
export const menuPopoverClasses = `${menuPanelClasses} shadow-none data-[state=open]:animate-none`;

export const menuSeparatorClasses =
  'mx-2 my-1 h-px w-auto shrink-0 self-stretch bg-neutral-300 dark:bg-neutral-700';

/** The arrow on a row that opens a list beside the menu. */
export const menuChevronClasses = 'size-3.5 text-neutral-500 dark:text-neutral-400';

/** How far a list opened from a row stands off the menu. */
export const MENU_SUB_OFFSET = 6;

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

/** The on/off box at the end of a toggle row. It slides to its new state. */
/** A preference's on and off: the website's switch, in place of the box. */
/**
 * One highlight that glides to whichever row is lit, by pointer or by keyboard,
 * and stays on a row whose list is open beside it. Goes first in a menu's panel,
 * so the rows paint over it, and the panel has to be positioned.
 */
export function MenuGlide({ follow = 'highlight' }: { follow?: 'highlight' | 'pointer' }) {
  const glide = React.useRef<HTMLSpanElement>(null);

  React.useLayoutEffect(() => {
    const el = glide.current;
    const panel = el?.parentElement;
    if (!el || !panel) return;

    let shown = false;
    let leaving: ReturnType<typeof setTimeout> | undefined;
    // A panel of plain buttons rather than a Radix menu has no highlight to
    // read, so the glide follows the pointer and focus itself.
    let pointed: HTMLElement | null = null;
    const update = () => {
      const row =
        follow === 'pointer'
          ? ((pointed?.isConnected ? pointed : null) ??
            panel.querySelector<HTMLElement>('button:has([data-expanded])'))
          : (panel.querySelector<HTMLElement>('[data-highlighted]') ??
            panel.querySelector<HTMLElement>('[role="menuitem"][data-state="open"]'));
      clearTimeout(leaving);
      if (!row) {
        // Passing from one row to the next is a moment with neither lit, which
        // must not count as leaving, or the highlight would never slide.
        leaving = setTimeout(() => {
          shown = false;
          el.style.opacity = '0';
        }, 80);
        return;
      }
      const box = row.getBoundingClientRect();
      const frame = panel.getBoundingClientRect();
      // Arriving from nothing it appears in place, rather than sliding in from
      // wherever it last was.
      if (!shown) {
        el.style.transition = 'none';
      }
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      el.style.transform = `translate(${box.left - frame.left + panel.scrollLeft - panel.clientLeft}px, ${box.top - frame.top + panel.scrollTop - panel.clientTop}px)`;
      el.dataset.danger = row.className.includes('text-red-') ? 'true' : 'false';
      if (!shown) {
        void el.offsetHeight;
        el.style.transition = '';
      }
      el.style.opacity = '1';
      shown = true;
    };

    const observer = new MutationObserver(update);
    observer.observe(panel, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-highlighted', 'data-state'],
    });
    const enter = (event: Event) => {
      pointed =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('button:not(:disabled)')
          : null;
      update();
    };
    const leave = () => {
      pointed = null;
      update();
    };
    if (follow === 'pointer') {
      panel.addEventListener('pointerover', enter);
      panel.addEventListener('pointerleave', leave);
      panel.addEventListener('focusin', enter);
      panel.addEventListener('focusout', leave);
      panel.addEventListener('scroll', update, true);
    }
    update();
    return () => {
      clearTimeout(leaving);
      observer.disconnect();
      panel.removeEventListener('pointerover', enter);
      panel.removeEventListener('pointerleave', leave);
      panel.removeEventListener('focusin', enter);
      panel.removeEventListener('focusout', leave);
      panel.removeEventListener('scroll', update, true);
    };
  }, [follow]);

  return (
    <span
      ref={glide}
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 rounded-md bg-neutral-950/5 opacity-0 transition-[transform,opacity,background-color,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[danger=true]:bg-red-500/[12%] motion-reduce:transition-none dark:bg-neutral-50/7 dark:data-[danger=true]:bg-red-500/20"
    />
  );
}

/** A row's shortcut, on the right in quiet type: `Ctrl+X`. */
export function MenuShortcut({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] whitespace-nowrap text-neutral-500 tabular-nums dark:text-neutral-400">
      {children}
    </span>
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
