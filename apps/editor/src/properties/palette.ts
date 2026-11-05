export const STROKE_SWATCHES = [
  { value: '#1e1e1e', labelKey: 'color.black' },
  { value: '#e03131', labelKey: 'color.red' },
  { value: '#2f9e44', labelKey: 'color.green' },
  { value: '#1971c2', labelKey: 'color.blue' },
  { value: '#f08c00', labelKey: 'color.orange' },
] as const;

/**
 * The fill's quick picks: full colours rather than pastels, so a filled shape
 * reads as the colour picked on either board. Paler ones are a click away on
 * the wheel.
 */
/**
 * The quick picks for the words inside a shape: dark and light first, since
 * the point is words that read on whatever the shape is filled with. Painted
 * as they are on either board — black is black on the dark board too.
 */
export const TEXT_SWATCHES = [
  { value: '#1e1e1e', labelKey: 'color.black' },
  { value: '#ffffff', labelKey: 'color.white' },
  { value: '#e03131', labelKey: 'color.red' },
  { value: '#1971c2', labelKey: 'color.blue' },
  { value: '#2f9e44', labelKey: 'color.green' },
] as const;

export const BACKGROUND_SWATCHES = [
  { value: null, labelKey: 'color.transparent' },
  { value: '#fa5252', labelKey: 'color.red' },
  { value: '#40c057', labelKey: 'color.green' },
  { value: '#228be6', labelKey: 'color.blue' },
  { value: '#fab005', labelKey: 'color.yellow' },
] as const;

/**
 * A sticky note's papers, in the engine's order. No transparent: a note is
 * always paper, and its dark words need a pale one under them on either board.
 */
export const NOTE_SWATCHES = [
  { value: '#ffec99', labelKey: 'color.yellow' },
  { value: '#ffd8a8', labelKey: 'color.orange' },
  { value: '#fcc2d7', labelKey: 'color.pink' },
  { value: '#d0bfff', labelKey: 'color.purple' },
  { value: '#a5d8ff', labelKey: 'color.blue' },
  { value: '#96f2d7', labelKey: 'color.teal' },
  { value: '#b2f2bb', labelKey: 'color.green' },
  { value: '#e9ecef', labelKey: 'color.gray' },
] as const;

/**
 * The bucket's quick picks: the fill swatches with transparent swapped for
 * white, since a transparent pour would leave no mark.
 */
export const BUCKET_SWATCHES = [
  { value: '#ffffff', labelKey: 'color.white' },
  { value: '#fa5252', labelKey: 'color.red' },
  { value: '#40c057', labelKey: 'color.green' },
  { value: '#228be6', labelKey: 'color.blue' },
  { value: '#fab005', labelKey: 'color.yellow' },
] as const;

/**
 * What the bucket pours when the fill colour it shares with the shape tools
 * is transparent — the green swatch.
 */
export const BUCKET_FALLBACK_COLOR = '#40c057';

/** The colour the bucket actually pours, given the shared fill colour. */
export function bucketFillColor(fillColor: string | null): string {
  return fillColor ?? BUCKET_FALLBACK_COLOR;
}

/**
 * The colour B steps the bucket on to, pressed while it is already in hand:
 * the next of its swatches, round and round. White is left out — pressed
 * through quickly it reads as the fill vanishing — and any colour not among
 * them starts the round at the first.
 */
export function nextBucketColor(current: string): string {
  const picks = BUCKET_SWATCHES.map((swatch) => swatch.value).filter(
    (value) => value !== '#ffffff',
  );
  const index = picks.findIndex((value) => value.toLowerCase() === current.toLowerCase());
  return picks[(index + 1) % picks.length]!;
}

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
export const CANVAS_BACKGROUND = { light: '#f7f7f8', dark: '#101012' } as const;

/** The colour to actually paint, for the theme on screen. */
export function canvasBackgroundFor(theme: CanvasTheme): string {
  return CANVAS_BACKGROUND[theme];
}

/** Every stroke weight the Weight row steps through, in px: 1 to 10. */
export const STROKE_WIDTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

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
