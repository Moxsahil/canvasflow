import type { CSSProperties } from 'react';

export type SurfaceTheme = 'light' | 'dark';

/**
 * Every colour the app's dialogs paint, by the job it does rather than by its
 * value.
 *
 * This is the surface the app puts up when it stops the board to say or ask
 * something. It is deliberately not the editor's chrome tokens: chrome frames
 * the canvas, and a dialog is the one thing that isn't framing it. The whole
 * table is declared once as custom properties on a dialog's root element, so
 * everything inside reads `var(--surface-*)` and the theme is decided in one
 * place rather than at every call site.
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
interface SurfacePalette {
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

const PALETTES: Record<SurfaceTheme, SurfacePalette> = {
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
 * inside reads `var(--surface-*)`, so the theme is decided once here rather
 * than at forty call sites.
 */
export function surfaceThemeVars(theme: SurfaceTheme): CSSProperties {
  const palette = PALETTES[theme];
  return {
    '--surface-backdrop': palette.backdrop,
    '--surface-panel': palette.surface,
    '--surface-rail': palette.rail,
    '--surface-border': palette.border,
    '--surface-card': palette.card,
    '--surface-input': palette.input,
    '--surface-raised': palette.raised,
    '--surface-raised-hover': palette.raisedHover,
    '--surface-nav-active': palette.navActive,
    '--surface-nav-hover': palette.navHover,
    '--surface-fg': palette.fg,
    '--surface-fg-muted': palette.fgMuted,
    '--surface-fg-faint': palette.fgFaint,
    '--surface-accent': palette.accent,
    '--surface-accent-hover': palette.accentHover,
    '--surface-on-accent': palette.onAccent,
    '--surface-toggle-off': palette.toggleOff,
    '--surface-danger': palette.danger,
    '--surface-danger-border': palette.dangerBorder,
    '--surface-danger-wash': palette.dangerWash,
    '--surface-shadow': palette.shadow,
    ...chromeTokensFor(palette),
  } as CSSProperties;
}

/**
 * The editor's own colour tokens, re-pointed at this palette.
 *
 * Tailwind resolves `bg-card` and its neighbours to `var(--color-card)` at
 * paint time, so redefining those properties on the dialog's root is enough to
 * move everything inside it onto this surface — which is the same mechanism
 * `styles/theme.css` already uses to swap the whole editor into dark.
 *
 * The point is that a dialog can be built from the shared components without
 * each one having to be taught about the surface: a Button, a Card or a Select
 * dropped inside lands on the right colours by default, and only the pieces
 * whose *shape* differs from the design need their own treatment. Without this
 * the alternative is repainting every child by hand and finding the one that
 * was missed later, on a white card in a dark dialog.
 */
function chromeTokensFor(palette: SurfacePalette): Record<string, string> {
  return {
    '--color-background': palette.surface,
    '--color-foreground': palette.fg,
    '--color-card': palette.card,
    '--color-card-foreground': palette.fg,
    '--color-popover': palette.card,
    '--color-popover-foreground': palette.fg,
    '--color-primary': palette.accent,
    '--color-primary-foreground': palette.onAccent,
    '--color-secondary': palette.raised,
    '--color-secondary-foreground': palette.fg,
    '--color-muted': palette.raised,
    '--color-muted-foreground': palette.fgMuted,
    '--color-accent': palette.navActive,
    '--color-accent-foreground': palette.fg,
    '--color-destructive': palette.danger,
    '--color-destructive-foreground': palette.onAccent,
    '--color-destructive-solid': palette.danger,
    '--color-border': palette.border,
    '--color-input': palette.input,
    '--color-ring': palette.accent,
    // The stacking ladder as well as the colours: it is declared on
    // `.cf-editor`, and a dialog portals to <body>, outside it. Without this a
    // popup asking for `z-(--zIndex-modal)` gets nothing and falls to `auto`.
    '--zIndex-popup': '100',
    '--zIndex-modal': '1000',
  };
}
