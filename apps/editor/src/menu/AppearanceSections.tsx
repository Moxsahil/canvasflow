import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar';
import { formatShortcut } from '../help/platform';
import type { ThemePreference } from '../theme';
import {
  CANVAS_BACKGROUNDS,
  resolveCanvasBackground,
  type CanvasTheme,
} from '../properties/palette';
import { MenuSection } from './MenuSection';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string; icon: unknown }>;

interface ThemeSectionProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}

/** Light, dark or system, as three rows rather than a popup. */
export function ThemeSection({ value, onChange }: ThemeSectionProps) {
  const active = THEME_OPTIONS.find((option) => option.value === value) ?? THEME_OPTIONS[2];
  const ActiveIcon = active.icon;

  return (
    <MenuSection
      label="Theme"
      tooltip={`Theme — ${active.label} (${formatShortcut('alt+shift+d')} toggles)`}
      icon={<ActiveIcon />}
    >
      {THEME_OPTIONS.map(({ value: option, label, icon: Icon }) => (
        <SidebarMenuSubItem key={option}>
          <SidebarMenuSubButton asChild isActive={option === value}>
            <button
              type="button"
              role="radio"
              aria-checked={option === value}
              onClick={() => onChange(option)}
              data-testid={`menu-theme-${option}`}
            >
              <Icon />
              <span>{label}</span>
              {option === value && <Check className="ml-auto" />}
            </button>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </MenuSection>
  );
}

interface BackgroundSectionProps {
  value: string;
  onChange: (color: string) => void;
  /** Which column of each preset to show, matching the board on screen. */
  theme: CanvasTheme;
}

/** The canvas background presets, each previewed by its own colour. */
export function BackgroundSection({ value, onChange, theme }: BackgroundSectionProps) {
  const activeLabel = CANVAS_BACKGROUNDS.find((preset) => preset.light === value)?.label ?? value;

  return (
    <MenuSection
      label="Background"
      tooltip={`Canvas background — ${activeLabel}`}
      icon={<Swatch color={resolveCanvasBackground(value, theme)} />}
    >
      {CANVAS_BACKGROUNDS.map((preset) => (
        <SidebarMenuSubItem key={preset.light}>
          <SidebarMenuSubButton asChild isActive={preset.light === value}>
            <button
              type="button"
              aria-pressed={preset.light === value}
              onClick={() => onChange(preset.light)}
            >
              <Swatch color={preset[theme]} />
              <span>{preset.label}</span>
              {preset.light === value && <Check className="ml-auto" />}
            </button>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </MenuSection>
  );
}

/**
 * A colour chip where a row's icon would be. Sized in code rather than by the
 * menu's `[&>svg]:size-4`, which only reaches actual icons.
 */
function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={cn('size-4 shrink-0 rounded-sm border border-sidebar-border', className)}
    />
  );
}
