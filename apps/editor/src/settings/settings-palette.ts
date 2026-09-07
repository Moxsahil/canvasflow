import type { CSSProperties } from 'react';

export type SettingsTheme = 'light' | 'dark';

/**
 * Every colour the dialog paints, by the job it does rather than by its value.
 *
 * The dark column is the design, hex for hex. The light one mirrors it by role:
 * where dark stacks the card *under* the shell and the input under that, light
 * stacks them the other way and leans on the hairline to keep the edges — so
 * "recessed" and "raised" still read as themselves rather than being inverted
 * into mud.
 *
 * The accent is deliberately the same blue in both. It is the one colour the
 * design uses to mean something (selected, primary, you), and a theme is a poor
 * reason for it to change identity.
 */
interface SettingsPalette {
  /** Dims the board behind the dialog. */
  backdrop: string;
  /** The dialog itself, behind the pane. */
  surface: string;
  /** The section rail, a shade off the surface. */
  rail: string;
  /** Hairlines, and every border in the dialog. */
  border: string;
  /** The cards the rows sit in. */
  card: string;
  /** Text fields — the one surface that reads as recessed. */
  input: string;
  /** Secondary buttons, which read as raised off the card. */
  raised: string;
  raisedHover: string;
  /** The selected rail row, and the resting hover behind an unselected one. */
  navActive: string;
  navHover: string;
  /** Titles and field values. */
  fg: string;
  /** Subtitles, group labels, unselected rail rows. */
  fgMuted: string;
  /** Hints, placeholders, and the quietest buttons. */
  fgFaint: string;
  accent: string;
  accentHover: string;
  onAccent: string;
  /** The switch's track while off, and the empty part of the storage meter. */
  toggleOff: string;
  /** Only the Danger zone card, which holds the one irreversible action. */
  danger: string;
  dangerBorder: string;
  dangerWash: string;
  shadow: string;
}

const PALETTES: Record<SettingsTheme, SettingsPalette> = {
  dark: {
    backdrop: 'rgba(0,0,0,0.5)',
    surface: '#1a1a19',
    rail: 'rgba(23,23,23,0.67)',
    border: '#232323',
    card: '#131313',
    input: '#0b0b0b',
    raised: '#1e1e1e',
    raisedHover: '#282828',
    navActive: '#1a1a1a',
    navHover: '#161616',
    fg: '#f2f2f2',
    fgMuted: '#9a9a9a',
    fgFaint: '#6b6b6b',
    accent: '#3b82f6',
    accentHover: '#2f76e8',
    onAccent: '#ffffff',
    toggleOff: '#2f2f2f',
    danger: '#f87171',
    dangerBorder: '#5a2a2a',
    dangerWash: 'rgba(248,113,113,0.12)',
    shadow: '0px 28px 64px 0px rgba(0,0,0,0.6)',
  },
  light: {
    // Lighter than the dark backdrop: 50% black over a white board reads as a
    // fault rather than as depth.
    backdrop: 'rgba(0,0,0,0.35)',
    surface: '#ffffff',
    rail: 'rgba(247,247,246,0.85)',
    border: '#e4e4e2',
    card: '#fafaf9',
    input: '#ffffff',
    raised: '#f4f4f2',
    raisedHover: '#eaeae7',
    navActive: '#ececea',
    navHover: '#f2f2f0',
    fg: '#1a1a19',
    fgMuted: '#5f5f5b',
    fgFaint: '#767671',
    accent: '#3b82f6',
    accentHover: '#2f76e8',
    onAccent: '#ffffff',
    toggleOff: '#d9d9d6',
    danger: '#dc2626',
    dangerBorder: '#f0c8c8',
    dangerWash: 'rgba(220,38,38,0.08)',
    // Shorter and far weaker: the dark shadow exists to separate one near-black
    // from another, which a light page does not need.
    shadow: '0px 24px 56px 0px rgba(0,0,0,0.18)',
  },
};

/**
 * The palette as custom properties, for the dialog's root element. Everything
 * inside reads `var(--settings-*)`, so the theme is decided once here rather
 * than at forty call sites.
 */
export function settingsThemeVars(theme: SettingsTheme): CSSProperties {
  const palette = PALETTES[theme];
  return {
    '--settings-backdrop': palette.backdrop,
    '--settings-surface': palette.surface,
    '--settings-rail': palette.rail,
    '--settings-border': palette.border,
    '--settings-card': palette.card,
    '--settings-input': palette.input,
    '--settings-raised': palette.raised,
    '--settings-raised-hover': palette.raisedHover,
    '--settings-nav-active': palette.navActive,
    '--settings-nav-hover': palette.navHover,
    '--settings-fg': palette.fg,
    '--settings-fg-muted': palette.fgMuted,
    '--settings-fg-faint': palette.fgFaint,
    '--settings-accent': palette.accent,
    '--settings-accent-hover': palette.accentHover,
    '--settings-on-accent': palette.onAccent,
    '--settings-toggle-off': palette.toggleOff,
    '--settings-danger': palette.danger,
    '--settings-danger-border': palette.dangerBorder,
    '--settings-danger-wash': palette.dangerWash,
    '--settings-shadow': palette.shadow,
  } as CSSProperties;
}
