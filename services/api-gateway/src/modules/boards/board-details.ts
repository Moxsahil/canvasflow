import { boardColorEnum, type BoardDetailsPatch, type BoardSummary } from '@canvasflow/db';

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
