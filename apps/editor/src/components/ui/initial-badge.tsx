import { cn } from '@/lib/utils';

/**
 * The two-line identity rows — the board at the top of the sidebar, the account
 * at the foot — written out rather than composed from `SidebarMenuButton`.
 *
 * That component declares padding twice for the collapsed state (`p-2!` on the
 * base, `p-0!` on its `lg` size) and relies on tailwind-merge to drop one. Both
 * are `!important` with equal specificity, so when the merge misses them — as
 * it does whenever a tailwind-merge built for Tailwind v3 meets v4's trailing
 * `!` — stylesheet order decides, `p-2` wins, and a full-width badge is clipped
 * and shoved off the icon column's axis. One padding class per state cannot go
 * wrong that way.
 */
export const identityRowClasses = cn(
  'flex h-12 w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm',
  'outline-hidden ring-sidebar-ring transition-colors focus-visible:ring-2',
  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
  // Collapsed: exactly the badge, in the same 8px-inset column as every icon.
  'group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:p-0!',
);

/** Everything in an identity row except the badge, which the collapse hides. */
export const identityDetailClasses = 'group-data-[collapsible=icon]:hidden';

interface InitialBadgeProps {
  /** The name behind the badge; its first character is what shows. */
  label: string;
  /** A logo or photo, when there is one. Falls back to the initial. */
  src?: string | null;
  className?: string;
}

/**
 * The square that stands in for a board, a workspace or a person.
 *
 * Deliberately not the Avatar component: that one's fallback paints with the
 * old chrome tokens, so its colour depended on a class merge going the right
 * way. This paints once, from the sidebar's own palette.
 */
export function InitialBadge({ label, src, className }: InitialBadgeProps) {
  const initial = label.trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex aspect-square size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground',
        className,
      )}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initial}
    </span>
  );
}
