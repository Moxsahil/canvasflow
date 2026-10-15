export const STROKE_SWATCHES = [
  { value: '#1e1e1e', labelKey: 'color.black' },
  { value: '#e03131', labelKey: 'color.red' },
  { value: '#2f9e44', labelKey: 'color.green' },
  { value: '#1971c2', labelKey: 'color.blue' },
  { value: '#f08c00', labelKey: 'color.orange' },
] as const;

export const BACKGROUND_SWATCHES = [
  { value: null, labelKey: 'color.transparent' },
  { value: '#ffc9c9', labelKey: 'color.red' },
  { value: '#b2f2bb', labelKey: 'color.green' },
  { value: '#a5d8ff', labelKey: 'color.blue' },
  { value: '#ffec99', labelKey: 'color.yellow' },
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
  { value: 1, labelKey: 'style.width.thin' },
  { value: 2, labelKey: 'style.width.bold' },
  { value: 4, labelKey: 'style.width.extraBold' },
] as const;

/** Font stacks offered by the Font family row, keyed by the label shown. */
export const FONT_FAMILIES = [
  { value: '"Caveat", "Comic Sans MS", system-ui, sans-serif', labelKey: 'style.font.handDrawn' },
  { value: 'Helvetica, Arial, system-ui, sans-serif', labelKey: 'style.font.normal' },
  { value: '"JetBrains Mono", "Fira Code", monospace', labelKey: 'style.font.code' },
] as const;

export const ARROWHEADS = [
  { value: 'none', labelKey: 'style.arrowhead.none' },
  { value: 'arrow', labelKey: 'style.arrowhead.arrow' },
  { value: 'bar', labelKey: 'style.arrowhead.bar' },
  { value: 'circle', labelKey: 'style.arrowhead.circle' },
  { value: 'circle_outline', labelKey: 'style.arrowhead.circle_outline' },
  { value: 'triangle', labelKey: 'style.arrowhead.triangle' },
  { value: 'triangle_outline', labelKey: 'style.arrowhead.triangle_outline' },
  { value: 'diamond', labelKey: 'style.arrowhead.diamond' },
  { value: 'diamond_outline', labelKey: 'style.arrowhead.diamond_outline' },
] as const;

export const FONT_SIZES = [
  { value: 16, labelKey: 'style.fontSize.small' },
  { value: 20, labelKey: 'style.fontSize.medium' },
  { value: 28, labelKey: 'style.fontSize.large' },
  { value: 36, labelKey: 'style.fontSize.extraLarge' },
] as const;
