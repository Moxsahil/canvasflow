import { cn } from '@/lib/utils';
import { boardSwatch } from './board-colors';
import type { BoardColor } from './workspace-api';

/**
 * How a board reads in a list.
 *
 * Shared by the switcher's board panel and the manage dialog so the two lists
 * of the same boards don't drift into showing them differently.
 */

/** The board's colour tag. Purely decorative — the name beside it is the label. */
export function ColorDot({ color, className }: { color: BoardColor; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: boardSwatch(color) }}
    />
  );
}

/** Short enough to sit beside a title without crowding it. */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
