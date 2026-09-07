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

export type CanvasTheme = 'light' | 'dark';

/**
 * The ground the whole canvas is painted on, one colour per theme. Unlike the
 * swatches above, this tints the board rather than a shape — and it isn't a
 * choice: the board follows the app theme, so there is nothing to store and
 * nothing to reconcile between the people sharing a board.
 *
 * The dark value isn't the light one inverted. The board is the one surface
 * where that inversion produced a colour nobody would pick, so the two are
 * stated independently and neither constrains the other.
 */
export const CANVAS_BACKGROUND = { light: '#fafaf9', dark: '#181818' } as const;

/** The colour to actually paint, for the theme on screen. */
export function canvasBackgroundFor(theme: CanvasTheme): string {
  return CANVAS_BACKGROUND[theme];
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
