import { Monitor, Moon, Sun } from 'lucide-react';
import { SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatShortcut } from '../help/platform';
import type { ThemePreference } from '../theme';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string; icon: unknown }>;

interface ThemeToggleProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}

/**
 * The theme picker: all three choices on screen at once, one click each.
 *
 * It is the only appearance control, and switching theme is something people do
 * on a whim rather than on a task — so it sits in the sidebar as a row of
 * buttons rather than behind a section that has to be opened first.
 *
 * The group turns into a column when the sidebar collapses to its icon rail,
 * where three buttons side by side would not fit. Nothing is hidden there: the
 * choices stay one click away at either width.
 */
export function ThemeToggle({ value, onChange }: ThemeToggleProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const shortcut = formatShortcut('alt+shift+d');

  return (
    <SidebarMenuItem className="px-2 group-data-[collapsible=icon]:px-0">
      <div
        title={`Theme — ${shortcut} toggles`}
        className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center"
      >
        <span className="text-sm text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          Theme
        </span>
        <ToggleGroup
          value={[value]}
          orientation={collapsed ? 'vertical' : 'horizontal'}
          // A toggle group lets the pressed button be pressed again, which would
          // leave the theme unset — there is no such state, so an empty change
          // is simply the current choice being re-picked.
          onValueChange={([next]: ThemePreference[]) => {
            if (next) onChange(next);
          }}
          aria-label="Theme"
          aria-keyshortcuts={shortcut}
          className="border-sidebar-border bg-sidebar-accent/40 group-data-[collapsible=icon]:flex-col"
        >
          {THEME_OPTIONS.map(({ value: option, label, icon: Icon }) => (
            <ToggleGroupItem
              key={option}
              value={option}
              aria-label={label}
              title={label}
              data-testid={`menu-theme-${option}`}
              className="size-7 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-sidebar-accent-foreground"
            >
              <Icon />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </SidebarMenuItem>
  );
}
