import type { BoardColor } from './workspace-api';

/**
 * The tag colours a board can carry, in the order they are offered.
 *
 * Fixed swatches rather than theme tokens: a tag is only useful if it is the
 * same colour every time you see it, and these seven have to stay apart from
 * one another on the sidebar's surface in both themes. Gray leads the same
 * life as the others but means "untagged" — it is what a board starts with.
 */
export const BOARD_COLORS: readonly { value: BoardColor; label: string; swatch: string }[] = [
  { value: 'red', label: 'Red', swatch: '#ef4444' },
  { value: 'orange', label: 'Orange', swatch: '#f97316' },
  { value: 'yellow', label: 'Yellow', swatch: '#eab308' },
  { value: 'green', label: 'Green', swatch: '#22c55e' },
  { value: 'blue', label: 'Blue', swatch: '#3b82f6' },
  { value: 'purple', label: 'Purple', swatch: '#a855f7' },
  { value: 'gray', label: 'Gray', swatch: '#9ca3af' },
];

const SWATCHES = new Map(BOARD_COLORS.map((color) => [color.value, color.swatch]));

/** The dot colour for a board, falling back to gray for a value we don't know. */
export function boardSwatch(color: BoardColor): string {
  return SWATCHES.get(color) ?? '#9ca3af';
}
