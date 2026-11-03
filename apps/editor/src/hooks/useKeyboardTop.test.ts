import { describe, expect, it } from 'vitest';
import { keyboardTop } from './useKeyboardTop';

describe('keyboardTop', () => {
  it('finds no keyboard when the viewport fills the window', () => {
    expect(keyboardTop(844, { height: 844, offsetTop: 0 })).toBeNull();
  });

  it('ignores the browser bars sliding away', () => {
    expect(keyboardTop(844, { height: 780, offsetTop: 0 })).toBeNull();
  });

  it('puts the keyboard where the visible part of the page ends', () => {
    expect(keyboardTop(844, { height: 508, offsetTop: 0 })).toBe(508);
  });

  it('allows for the page having been scrolled up to show the field', () => {
    expect(keyboardTop(844, { height: 508, offsetTop: 40 })).toBe(548);
  });
});
