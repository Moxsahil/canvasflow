import { describe, expect, it } from 'vitest';
import { generateKeyBetween } from 'fractional-indexing';
import {
  MAX_BOARD_TITLE,
  MAX_PIN_POSITION,
  readBoardDetails,
  readPinPosition,
} from './board-details.js';

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

describe('readPinPosition', () => {
  it('accepts the keys the editor makes', () => {
    const first = generateKeyBetween(null, null);
    const above = generateKeyBetween(null, first);
    const between = generateKeyBetween(above, first);
    for (const key of [first, above, between]) {
      expect(readPinPosition({ position: key })).toBe(key);
    }
  });

  it('turns away anything that is not a well-formed key', () => {
    expect(readPinPosition({})).toBeNull();
    expect(readPinPosition(null)).toBeNull();
    expect(readPinPosition({ position: 3 })).toBeNull();
    expect(readPinPosition({ position: '' })).toBeNull();
    expect(readPinPosition({ position: 'a0 ' })).toBeNull();
    expect(readPinPosition({ position: "a0'; drop" })).toBeNull();
    // A trailing zero digit is not a key fractional order keys can produce.
    expect(readPinPosition({ position: 'a00' })).toBeNull();
    expect(readPinPosition({ position: 'a' + '1'.repeat(MAX_PIN_POSITION) })).toBeNull();
  });
});
