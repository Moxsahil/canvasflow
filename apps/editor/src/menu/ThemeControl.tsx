import { motion } from 'framer-motion';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatShortcut } from '../help/platform';
import type { ThemePreference } from '../theme';
import { railLabelVariants } from './menu-motion';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string; icon: unknown }>;

interface ThemeControlProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  expanded: boolean;
  /** Where the popup portals to — see DropdownMenuContent's `container`. */
  portalContainer: HTMLElement | null;
  /** Lets the rail pin itself open while the popup is up. */
  onOpenChange?: (open: boolean) => void;
}

export function ThemeControl({
  value,
  onChange,
  expanded,
  portalContainer,
  onOpenChange,
}: ThemeControlProps) {
  const active = THEME_OPTIONS.find((option) => option.value === value) ?? THEME_OPTIONS[2];
  const ActiveIcon = active.icon;
  const toggleHint = formatShortcut('alt+shift+d');

  return (
    <li className="flex items-center overflow-hidden">
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={`Theme — ${active.label} (${toggleHint} toggles)`}
            aria-label={`Theme, currently ${active.label}`}
            data-testid="menu-theme"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--border-radius-md) text-(--text-primary-color) transition-colors hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none"
          >
            <ActiveIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" container={portalContainer}>
          <DropdownMenuLabel className="text-xs font-normal text-(--keybinding-color)">
            Theme
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={value}
            onValueChange={(next) => onChange(next as ThemePreference)}
          >
            {THEME_OPTIONS.map(({ value: option, label, icon: Icon }) => (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                // Changing theme shouldn't dismiss the menu — you often want to
                // see the change and then pick differently.
                onSelect={(event) => event.preventDefault()}
                data-testid={`menu-theme-${option}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <motion.div
        variants={railLabelVariants}
        aria-hidden={!expanded}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 pr-2',
          !expanded && 'pointer-events-none',
        )}
      >
        <span className="truncate text-xs text-(--text-primary-color)">Theme</span>
        <span className="ml-auto flex items-center gap-1" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map(({ value: option, label, icon: Icon }) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === value}
              aria-label={label}
              tabIndex={expanded && option === value ? 0 : -1}
              title={option === 'system' ? label : `${label} — ${toggleHint}`}
              onClick={() => onChange(option)}
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-(--border-radius-md) border transition-colors focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none',
                option === value
                  ? 'border-(--button-active-border) bg-(--color-surface-primary-container) text-(--color-on-primary-container)'
                  : 'border-(--default-border-color) text-(--text-primary-color) hover:bg-(--button-hover-bg)',
              )}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </span>
      </motion.div>
    </li>
  );
}
