import { cn } from '@/lib/utils';
import { formatShortcutKeys } from './platform';

const CAP =
  'inline-grid place-items-center whitespace-nowrap [font-family:inherit] rounded-[6px] bg-[var(--surface-wash)] font-medium leading-none text-[var(--surface-fg)] shadow-[inset_0_-1px_0_var(--surface-border),0_0_0_1px_var(--surface-border)]';

const SIZES = {
  /** In a list of shortcuts. */
  md: 'h-[22px] min-w-[22px] px-[6px] text-[11px]',
  /** Beside a line of text, such as a status or a sentence. */
  sm: 'h-[19px] min-w-[19px] px-[5px] text-[10.5px]',
};

/**
 * A shortcut as key caps, in this platform's names: ⌘ ⇧ on a Mac, Ctrl Shift
 * elsewhere. `keys` is in `mod+shift+z` notation, as the registry writes it.
 */
export function KeyCaps({
  keys,
  size = 'md',
  className,
}: {
  keys: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-[3px]', className)}>
      {formatShortcutKeys(keys).map((key, index) => (
        <kbd key={index} className={cn(CAP, SIZES[size])}>
          {key}
        </kbd>
      ))}
    </span>
  );
}
