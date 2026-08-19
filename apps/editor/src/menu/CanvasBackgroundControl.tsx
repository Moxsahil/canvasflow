import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CANVAS_BACKGROUNDS } from '../properties/palette';
import { railLabelVariants } from './menu-motion';

interface CanvasBackgroundControlProps {
  value: string;
  onChange: (color: string) => void;
  expanded: boolean;
  /** Where the popup portals to — see DropdownMenuContent's `container`. */
  portalContainer: HTMLElement | null;
  /** Lets the rail pin itself open while the popup is up. */
  onOpenChange?: (open: boolean) => void;
}

const swatchClasses =
  'h-5 w-5 shrink-0 rounded-(--border-radius-md) border border-(--default-border-color) transition-shadow [filter:var(--theme-filter)]';

/**
 * Canvas background picker, in both rail states: the current colour sits in the
 * icon column and opens a popup with every preset, which is the only way in
 * while the rail is collapsed. Expanding also reveals the five presets inline
 * for one-click switching.
 */
export function CanvasBackgroundControl({
  value,
  onChange,
  expanded,
  portalContainer,
  onOpenChange,
}: CanvasBackgroundControlProps) {
  const activeLabel = CANVAS_BACKGROUNDS.find((c) => c.value === value)?.label ?? value;

  return (
    <li className="flex items-center overflow-hidden">
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Canvas background — ${activeLabel}`}
            aria-label={`Canvas background, currently ${activeLabel}`}
            data-testid="menu-canvasBackground"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--border-radius-md) transition-colors hover:bg-(--button-hover-bg) focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)]"
          >
            <span className={swatchClasses} style={{ backgroundColor: value }} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" container={portalContainer}>
          <DropdownMenuLabel className="text-xs font-normal text-(--keybinding-color)">
            Canvas background
          </DropdownMenuLabel>
          {CANVAS_BACKGROUNDS.map(({ value: color, label }) => (
            <DropdownMenuItem key={color} onSelect={() => onChange(color)}>
              <span
                className={swatchClasses}
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span>{label}</span>
              {color === value && <Check className="ml-auto h-4 w-4" aria-hidden="true" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <motion.div
        variants={railLabelVariants}
        aria-hidden={!expanded}
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-1 pr-2',
          !expanded && 'pointer-events-none',
        )}
      >
        <span className="truncate text-xs text-(--text-primary-color)">Canvas background</span>
        <span className="flex items-center gap-1">
          {CANVAS_BACKGROUNDS.map(({ value: color, label }) => (
            <button
              key={color}
              type="button"
              tabIndex={expanded ? 0 : -1}
              onClick={() => onChange(color)}
              title={label}
              aria-label={label}
              aria-pressed={color === value}
              style={{ backgroundColor: color }}
              className={cn(
                swatchClasses,
                'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)]',
                color === value && 'shadow-[0_0_0_1px_var(--button-active-border)]',
              )}
            />
          ))}
        </span>
      </motion.div>
    </li>
  );
}
