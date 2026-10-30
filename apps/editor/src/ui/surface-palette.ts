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
  /** The dialog itself. */
  surface: string;
  /** Hairlines, and every border in the dialog. */
  border: string;
  /** The quieter rule between the groups of a page, a step under `border`. */
  line: string;
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
  /** The accent as small text and links, where the fill's own blue is too dark to read. */
  link: string;
  onAccent: string;
  /** The switch's track while off, and the empty part of the storage meter. */
  toggleOff: string;
  /** A soft fill that needs no border: a segmented control's track, a quiet button. */
  wash: string;
  washHover: string;
  /** The tinted band a window's header sits in, a step off the panel. */
  band: string;
  /** The selected segment, lifted off the wash. */
  thumb: string;
  thumbShadow: string;
  /** The accent at a whisper: the ring around a focused field. */
  accentWash: string;
  /** Said once something is saved. */
  ok: string;
  okWash: string;
  /** Something went only partly, or not at all, and nothing is lost. */
  warn: string;
  warnWash: string;
  /** Marks the row a search just led to, then fades. */
  flash: string;
  /** The shadow a header casts once the page scrolls under it. */
  stuck: string;
  /** A scrollbar's thumb: there when you look for it, and otherwise out of the way. */
  scrollbar: string;
  /** Only the Danger zone card, which holds the one irreversible action. */
  danger: string;
  dangerBorder: string;
  dangerWash: string;
  shadow: string;
}

/**
 * The windows' palette, the AI panel's included: the website's near-black,
 * hairlines and blue.
 */
const WINDOW_PALETTES: Record<SurfaceTheme, SurfacePalette> = {
  dark: {
    backdrop: 'rgba(5,5,7,0.66)',
    surface: '#111113',
    border: '#29292b',
    line: '#212124',
    card: '#141416',
    input: '#09090b',
    raised: '#1b1b1e',
    raisedHover: '#27272a',
    navActive: '#27272a',
    navHover: '#1b1b1e',
    fg: '#fafafa',
    fgMuted: '#9f9fa9',
    fgFaint: '#8b8b95',
    accent: '#135dfc',
    accentHover: '#2a6dfc',
    link: '#4d84fd',
    onAccent: '#ffffff',
    toggleOff: '#333338',
    wash: '#1b1b1e',
    washHover: '#27272a',
    band: '#111113',
    thumb: '#35353a',
    thumbShadow: '0 1px 2px rgba(0,0,0,0.5)',
    accentWash: 'rgba(77,132,253,0.16)',
    ok: '#4ade80',
    okWash: 'rgba(74,222,128,0.12)',
    warn: '#fbbf24',
    warnWash: 'rgba(251,191,36,0.12)',
    flash: 'rgba(77,132,253,0.22)',
    stuck: '0 8px 16px -12px rgba(0,0,0,0.9)',
    scrollbar: '#3f3f46',
    danger: '#f87171',
    dangerBorder: '#5a2a2a',
    dangerWash: 'rgba(248,113,113,0.12)',
    shadow: 'none',
  },
  light: {
    backdrop: 'rgba(9,9,11,0.36)',
    surface: '#ffffff',
    border: '#e4e4e7',
    line: '#f0f0f2',
    card: '#fafafa',
    input: '#ffffff',
    raised: '#f4f4f5',
    raisedHover: '#e9e9ec',
    navActive: '#efeff1',
    navHover: '#f4f4f5',
    fg: '#09090b',
    fgMuted: '#5f5f6b',
    fgFaint: '#71717a',
    accent: '#135dfc',
    accentHover: '#2a6dfc',
    link: '#135dfc',
    onAccent: '#ffffff',
    toggleOff: '#d4d4d8',
    wash: '#f4f4f5',
    washHover: '#e9e9ec',
    band: '#ffffff',
    thumb: '#ffffff',
    thumbShadow: '0 1px 2px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)',
    accentWash: 'rgba(19,93,252,0.08)',
    ok: '#15803d',
    okWash: 'rgba(22,163,74,0.1)',
    warn: '#b45309',
    warnWash: 'rgba(245,158,11,0.12)',
    flash: 'rgba(19,93,252,0.14)',
    stuck: '0 8px 14px -12px rgba(0,0,0,0.35)',
    scrollbar: '#d4d4d8',
    danger: '#dc2626',
    dangerBorder: '#f0c8c8',
    dangerWash: 'rgba(220,38,38,0.08)',
    shadow: 'none',
  },
};

/** The palette for every window: dialogs, Settings, Share and the AI panel. */
export function windowThemeVars(theme: SurfaceTheme): CSSProperties {
  return varsFor(WINDOW_PALETTES[theme]);
}

/**
 * A palette as custom properties. Everything inside reads `var(--surface-*)`,
 * so the theme is decided once here rather than at forty call sites.
 */
function varsFor(palette: SurfacePalette): CSSProperties {
  return {
    '--surface-backdrop': palette.backdrop,
    '--surface-panel': palette.surface,
    '--surface-border': palette.border,
    '--surface-line': palette.line,
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
    '--surface-link': palette.link,
    '--surface-on-accent': palette.onAccent,
    '--surface-toggle-off': palette.toggleOff,
    '--surface-wash': palette.wash,
    '--surface-wash-hover': palette.washHover,
    '--surface-band': palette.band,
    '--surface-thumb': palette.thumb,
    '--surface-thumb-shadow': palette.thumbShadow,
    '--surface-accent-wash': palette.accentWash,
    '--surface-ok': palette.ok,
    '--surface-ok-wash': palette.okWash,
    '--surface-warn': palette.warn,
    '--surface-warn-wash': palette.warnWash,
    '--surface-flash': palette.flash,
    '--surface-stuck': palette.stuck,
    '--surface-scrollbar': palette.scrollbar,
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
