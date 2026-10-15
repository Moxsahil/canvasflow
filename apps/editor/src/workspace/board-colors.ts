import type { TranslationKey } from '../i18n';
import type { BoardColor } from './workspace-api';

/**
 * The tag colours a board can carry, in the order they are offered.
 *
 * Fixed swatches rather than theme tokens: a tag is only useful if it is the
 * same colour every time you see it, and these seven have to stay apart from
 * one another on the sidebar's surface in both themes. Gray leads the same
 * life as the others but means "untagged" — it is what a board starts with.
 */
export const BOARD_COLORS: readonly {
  value: BoardColor;
  labelKey: TranslationKey;
  swatch: string;
}[] = [
  { value: 'red', labelKey: 'color.red', swatch: '#ef4444' },
  { value: 'orange', labelKey: 'color.orange', swatch: '#f97316' },
  { value: 'yellow', labelKey: 'color.yellow', swatch: '#eab308' },
  { value: 'green', labelKey: 'color.green', swatch: '#22c55e' },
  { value: 'blue', labelKey: 'color.blue', swatch: '#3b82f6' },
  { value: 'purple', labelKey: 'color.purple', swatch: '#a855f7' },
  { value: 'gray', labelKey: 'color.gray', swatch: '#9ca3af' },
];

const SWATCHES = new Map(BOARD_COLORS.map((color) => [color.value, color.swatch]));

/** The dot colour for a board, falling back to gray for a value we don't know. */
export function boardSwatch(color: BoardColor): string {
  return SWATCHES.get(color) ?? '#9ca3af';
}
