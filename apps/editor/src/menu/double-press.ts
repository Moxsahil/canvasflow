/** Two presses this close together, on the same thing, are one double press. */
export const DOUBLE_PRESS_MS = 400;

/**
 * The last press, kept outside any component on purpose: the first press on
 * another board opens it, which remounts the whole editor — sidebar and all —
 * and the second press lands on a row that was not there for the first. A
 * browser's own double-click does not survive that, and touch screens send
 * none at all; counting presses here works for a mouse, a finger and a pen.
 */
let last: { key: string; at: number } | null = null;

/**
 * Whether this press is the second of a double press on `key`. Presses from
 * the keyboard (`detail` 0, as Enter on a button sends) never count, so
 * opening a board twice from the keyboard is not taken for a rename.
 */
export function isSecondPress(key: string, event: { detail: number; timeStamp: number }): boolean {
  if (event.detail === 0) return false;
  const now = performance.timeOrigin + event.timeStamp;
  const second = last !== null && last.key === key && now - last.at < DOUBLE_PRESS_MS;
  // A third press starts again rather than renaming twice.
  last = second ? null : { key, at: now };
  return second;
}

/** Long enough for the editor to remount onto the board just opened; any older is stale. */
const CARRY_MS = 3000;

let carried: { boardId: string; at: number } | null = null;

/**
 * Ask for this board to be renamed once the editor has opened it.
 *
 * A double press on another board can land both presses before the editor has
 * moved over to it, and the rename the second one starts would go with the
 * old sidebar. Kept here, the sidebar that comes up next picks it up.
 */
export function carryRename(boardId: string): void {
  carried = { boardId, at: performance.now() };
}

/** The board to start renaming on arrival, if a double press just asked for one. */
export function takeCarriedRename(): string | null {
  const taken = carried && performance.now() - carried.at < CARRY_MS ? carried.boardId : null;
  carried = null;
  return taken;
}

/** For tests: forget the last press. */
export function forgetPresses(): void {
  last = null;
  carried = null;
}
