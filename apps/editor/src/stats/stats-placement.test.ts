import { describe, expect, it } from 'vitest';
import { STRIP_RESERVE, stripBottom } from './stats-placement';

/** The dock as an editor has it, and the two rows the strip can stand on. */
const DOCK = 470;
const BOTTOM_ROW = 16;
const ROW_ABOVE = 68;

describe('stripBottom', () => {
  it('stands on the bottom row when the corner left of the dock can hold it', () => {
    expect(stripBottom(1800, DOCK, 180)).toBe(BOTTOM_ROW);
  });

  it('stands on the row above when the corner is too narrow', () => {
    expect(stripBottom(1350, DOCK, 180)).toBe(ROW_ABOVE);
  });

  it('is decided by the strip at its fullest, so selecting something does not move it', () => {
    // Short now, with nothing selected; the corner would not hold it once
    // something is, and it does not wait until then to move.
    const board = DOCK + 2 * (STRIP_RESERVE + 28) - 40;

    expect(stripBottom(board, DOCK, 180)).toBe(ROW_ABOVE);
    expect(stripBottom(board, DOCK, STRIP_RESERVE)).toBe(ROW_ABOVE);
  });

  it('takes the corner exactly when the corner is exactly wide enough', () => {
    const board = DOCK + 2 * (STRIP_RESERVE + 28);

    expect(stripBottom(board, DOCK, 180)).toBe(BOTTOM_ROW);
    expect(stripBottom(board - 2, DOCK, 180)).toBe(ROW_ABOVE);
  });

  it('gives way to a strip wider than the room kept for it', () => {
    const board = DOCK + 2 * (STRIP_RESERVE + 28);

    expect(stripBottom(board, DOCK, STRIP_RESERVE + 40)).toBe(ROW_ABOVE);
  });

  it('has the whole row on a board with no dock', () => {
    expect(stripBottom(1300, 0, 180)).toBe(BOTTOM_ROW);
  });
});
