export const STROKE_SWATCHES = [
  { value: '#1e1e1e', label: 'Black' },
  { value: '#e03131', label: 'Red' },
  { value: '#2f9e44', label: 'Green' },
  { value: '#1971c2', label: 'Blue' },
  { value: '#f08c00', label: 'Orange' },
] as const;

export const BACKGROUND_SWATCHES = [
  { value: null, label: 'Transparent' },
  { value: '#ffc9c9', label: 'Red' },
  { value: '#b2f2bb', label: 'Green' },
  { value: '#a5d8ff', label: 'Blue' },
  { value: '#ffec99', label: 'Yellow' },
] as const;

/**
 * Board-level canvas backgrounds offered by the main menu. Unlike the swatches
 * above, these tint the whole canvas rather than a shape.
 *
 * Each preset states both themes. The dark value is no longer derived by
 * inverting the light one — the board is the one surface where that inversion
 * produced a colour nobody picked. Edit either column freely; neither
 * constrains the other.
 */
export const CANVAS_BACKGROUNDS = [
  { light: '#fafaf9', dark: '#181818', label: 'Default' },
  { light: '#ffffff', dark: '#0d0d0d', label: 'White' },
  { light: '#f5faff', dark: '#101822', label: 'Blue' },
  { light: '#fffce8', dark: '#1c1a10', label: 'Yellow' },
  { light: '#fdf8f6', dark: '#1e1917', label: 'Warm' },
] as const;

export type CanvasTheme = 'light' | 'dark';

/**
 * The stored identity of a background. The light hex doubles as the key, so
 * boards and files saved before the dark column existed still resolve.
 */
export const DEFAULT_CANVAS_BACKGROUND = CANVAS_BACKGROUNDS[0].light;

/**
 * The colour to actually paint for a stored background.
 *
 * An unrecognised value is used as-is in both themes: a board file carries a
 * raw hex, so an imported board can name a colour that is not a preset at all.
 */
export function resolveCanvasBackground(stored: string, theme: CanvasTheme): string {
  const preset = CANVAS_BACKGROUNDS.find((entry) => entry.light === stored);
  return preset ? preset[theme] : stored;
}

export const STROKE_WIDTHS = [
  { value: 1, label: 'Thin' },
  { value: 2, label: 'Bold' },
  { value: 4, label: 'Extra bold' },
] as const;

/** Font stacks offered by the Font family row, keyed by the label shown. */
export const FONT_FAMILIES = [
  { value: '"Caveat", "Comic Sans MS", system-ui, sans-serif', label: 'Hand-drawn' },
  { value: 'Helvetica, Arial, system-ui, sans-serif', label: 'Normal' },
  { value: '"JetBrains Mono", "Fira Code", monospace', label: 'Code' },
] as const;

export const ARROWHEADS = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'bar', label: 'Bar' },
  { value: 'circle', label: 'Circle' },
  { value: 'circle_outline', label: 'Circle outline' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'triangle_outline', label: 'Triangle outline' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'diamond_outline', label: 'Diamond outline' },
] as const;

export const FONT_SIZES = [
  { value: 16, label: 'Small' },
  { value: 20, label: 'Medium' },
  { value: 28, label: 'Large' },
  { value: 36, label: 'Extra large' },
] as const;
