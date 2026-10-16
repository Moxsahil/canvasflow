import { boardColorEnum, type BoardDetailsPatch, type BoardSummary } from '@canvasflow/db';
import { generateKeyBetween } from 'fractional-indexing';

/** Longer names are cut to this rather than refused, as they always were. */
export const MAX_BOARD_TITLE = 200;

const BOARD_COLORS: readonly BoardSummary['color'][] = boardColorEnum.enumValues;

/**
 * A rename, a re-tag, or both, read from a request body.
 *
 * Absent means "leave it alone"; present but unusable is refused with the
 * reason rather than silently dropped, so a client bug is visible. A string
 * is the reason to answer 400 with.
 */
export function readBoardDetails(body: unknown): BoardDetailsPatch | string {
  const input = (body ?? {}) as { title?: unknown; color?: unknown };
  const patch: BoardDetailsPatch = {};

  if (input.title !== undefined) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) return 'A board needs a name.';
    patch.title = title.slice(0, MAX_BOARD_TITLE);
  }

  if (input.color !== undefined) {
    const color = BOARD_COLORS.find((candidate) => candidate === input.color);
    if (!color) return 'Unknown board colour.';
    patch.color = color;
  }

  if (patch.title === undefined && patch.color === undefined) return 'Nothing to update.';
  return patch;
}

/** Far longer than any key a few thousand drags could make; a cap, not a target. */
export const MAX_PIN_POSITION = 64;

/**
 * The order key of a pin, read from a request body, or null when it is not a
 * well-formed one. Checked by asking for the key after it, which refuses
 * anything that is not a valid key — so a bad one is turned away here rather
 * than breaking the order of every pin that comes after it.
 */
export function readPinPosition(body: unknown): string | null {
  const position = (body as { position?: unknown } | null)?.position;
  if (typeof position !== 'string') return null;
  if (position.length === 0 || position.length > MAX_PIN_POSITION) return null;
  if (!/^[0-9A-Za-z]+$/.test(position)) return null;
  try {
    generateKeyBetween(position, null);
    return position;
  } catch {
    return null;
  }
}
