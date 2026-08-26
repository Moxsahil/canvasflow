/**
 * The colour transform dark mode applies to the whole board.
 *
 * Dark mode is not a second palette: the editor puts one CSS filter over the
 * live canvas, and an export runs the identical filter over the finished
 * bitmap, so a saved dark image matches the dark board exactly rather than
 * approximately. Everything here derives from the two constants below so the
 * live path, the export path, and the image compensation cannot drift apart.
 */

/** Fraction of the way to fully inverted. Just short of 1 keeps pure black off. */
const INVERT_AMOUNT = 0.93;

const HUE_ROTATION_DEG = 180;

export const DARK_EXPORT_FILTER = `invert(${INVERT_AMOUNT * 100}%) hue-rotate(${HUE_ROTATION_DEG}deg)`;

/**
 * The filter that cancels {@link DARK_EXPORT_FILTER} out.
 *
 * Every shape kind but one *wants* to be inverted in dark mode — dark strokes
 * become light ones and the drawing reads correctly. Photographs do not: a
 * portrait rendered through the board filter comes out looking like a negative.
 * Since the filter is applied to the composited canvas rather than per draw
 * call, the only way to exempt one shape is to pre-apply the inverse when
 * painting it, so the two cancel and the original pixels survive.
 *
 * Deriving it: the board filter is `v -> M · (k·1 - a·v)`, where `k` is the
 * invert amount, `a = 2k - 1` is the slope it implies, and `M` is the
 * hue-rotation matrix. Because `M` leaves greys alone, `M · 1 = 1`, and the
 * inverse falls out as `M⁻¹` followed by the per-channel map `c -> (k - c) / a`.
 * A 180° rotation is its own inverse, and that per-channel map is exactly a
 * full inversion followed by `contrast(1 / a)`.
 */
export const DARK_IMAGE_COMPENSATION_FILTER = [
  `hue-rotate(${HUE_ROTATION_DEG}deg)`,
  'invert(100%)',
  `contrast(${((1 / (2 * INVERT_AMOUNT - 1)) * 100).toFixed(4)}%)`,
].join(' ');
