import { describe, expect, it } from 'vitest';
import { stripBottom } from './stats-placement';

/** The dock as an editor has it, and the two rows the strip can stand on. */
const DOCK = 504;
const BOTTOM_ROW = 16;
const ROW_ABOVE = 68;
/** The strip with nothing selected, and with a text shape selected. */
const SHORT = 190;
const FULL = 540;

/** The room left of the dock on a board this wide, less the margins kept either side of the strip. */
const corner = (board: number) => (board - DOCK) / 2 - 28;

describe('stripBottom', () => {
  it('stands on the bottom row when the corner left of the dock can hold it', () => {
    expect(stripBottom(1872, DOCK, SHORT)).toBe(BOTTOM_ROW);
    expect(stripBottom(1872, DOCK, FULL)).toBe(BOTTOM_ROW);
  });

  it('stays there when the sidebar opens and the board loses its width', () => {
    // A 1920 window: 1872 of board beside the closed sidebar, 1664 beside the
    // open one. The corner is narrower, and still wider than the strip.
    expect(corner(1664)).toBeGreaterThan(FULL);
    expect(stripBottom(1664, DOCK, SHORT)).toBe(BOTTOM_ROW);
    expect(stripBottom(1664, DOCK, FULL)).toBe(BOTTOM_ROW);
  });

  it('stands on the row above only when it would run into the dock', () => {
    // Room for the totals, not for a selection's fields after them.
    expect(stripBottom(1280, DOCK, SHORT)).toBe(BOTTOM_ROW);
    expect(stripBottom(1280, DOCK, FULL)).toBe(ROW_ABOVE);
    expect(stripBottom(800, DOCK, SHORT)).toBe(ROW_ABOVE);
  });

  it('takes the corner exactly when the corner is exactly wide enough', () => {
    const board = DOCK + 2 * (FULL + 28);

    expect(stripBottom(board, DOCK, FULL)).toBe(BOTTOM_ROW);
    expect(stripBottom(board - 2, DOCK, FULL)).toBe(ROW_ABOVE);
  });

  it('has the whole row on a board with no dock', () => {
    expect(stripBottom(1300, 0, FULL)).toBe(BOTTOM_ROW);
  });
});
