import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatShortcut } from '../help/platform';
import { railLabelVariants } from './menu-motion';
import type { MenuItemMeta } from './menu-items';

interface MenuRailItemProps {
  meta: MenuItemMeta;
  /** Absent means the feature isn't built yet: the row disables itself. */
  onSelect?: () => void;
}

/**
 * One row of the rail: an icon that stays put, and a label that slides in as
 * the rail widens. The icon column is exactly as wide as the collapsed rail so
 * nothing shifts sideways during the transition; the label animates off the
 * rail's own `open`/`closed` variant, so the row needs no state of its own.
 */
export function MenuRailItem({ meta, onSelect }: MenuRailItemProps) {
  const { label, icon: Icon, shortcut, destructive } = meta;
  const disabled = !onSelect;
  const shortcutHint = shortcut ? formatShortcut(shortcut) : null;
  const title = disabled
    ? `${label} — coming soon`
    : shortcutHint
      ? `${label} — ${shortcutHint}`
      : label;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        title={title}
        aria-label={label}
        aria-keyshortcuts={shortcutHint ?? undefined}
        data-testid={`menu-${meta.id}`}
        className={cn(
          'flex h-8 w-full items-center overflow-hidden rounded-(--border-radius-md) transition-colors',
          disabled
            ? 'cursor-default opacity-45'
            : destructive
              ? 'text-(--color-danger) hover:bg-(--button-hover-bg)'
              : 'text-(--text-primary-color) hover:bg-(--button-hover-bg)',
          'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)]',
        )}
      >
        <span className="flex w-8 shrink-0 items-center justify-center">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <motion.span
          variants={railLabelVariants}
          aria-hidden="true"
          className="flex min-w-0 flex-1 items-center gap-2 pr-2 text-left"
        >
          <span className="truncate text-sm font-medium">{label}</span>
          {disabled ? (
            <Badge variant="outline" className="ml-auto shrink-0">
              Soon
            </Badge>
          ) : (
            shortcutHint && (
              <span className="ml-auto shrink-0 text-xs text-(--keybinding-color)">
                {shortcutHint}
              </span>
            )
          )}
        </motion.span>
      </button>
    </li>
  );
}
