import { describe, expect, it } from 'vitest';
import { MAX_BOARD_TITLE, readBoardDetails } from './board-details.js';

describe('readBoardDetails', () => {
  it('reads a rename, a re-tag, or both', () => {
    expect(readBoardDetails({ title: '  Plans  ' })).toEqual({ title: 'Plans' });
    expect(readBoardDetails({ color: 'blue' })).toEqual({ color: 'blue' });
    expect(readBoardDetails({ title: 'Plans', color: 'red' })).toEqual({
      title: 'Plans',
      color: 'red',
    });
  });

  it('cuts a long name rather than refusing it', () => {
    const patch = readBoardDetails({ title: 'x'.repeat(MAX_BOARD_TITLE + 50) });
    expect(patch).toEqual({ title: 'x'.repeat(MAX_BOARD_TITLE) });
  });

  it('refuses an empty name, an unknown colour, and an empty patch', () => {
    expect(readBoardDetails({ title: '   ' })).toBe('A board needs a name.');
    expect(readBoardDetails({ title: 42 })).toBe('A board needs a name.');
    expect(readBoardDetails({ color: 'teal' })).toBe('Unknown board colour.');
    expect(readBoardDetails({})).toBe('Nothing to update.');
    expect(readBoardDetails(null)).toBe('Nothing to update.');
  });
});
