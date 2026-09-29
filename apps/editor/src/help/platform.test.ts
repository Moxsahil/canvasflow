import { describe, expect, it } from 'vitest';
import { ariaKeyShortcut } from './platform';

describe('ariaKeyShortcut', () => {
  // No navigator in the test environment, so this is the non-Mac spelling.
  it('spells modifiers the way aria-keyshortcuts names them', () => {
    expect(ariaKeyShortcut('mod+shift+e')).toBe('Control+Shift+E');
    expect(ariaKeyShortcut('alt+z')).toBe('Alt+Z');
  });

  it('keeps a punctuation key as the character it is', () => {
    expect(ariaKeyShortcut("mod+'")).toBe("Control+'");
    expect(ariaKeyShortcut(']')).toBe(']');
  });

  it('names Delete in full', () => {
    expect(ariaKeyShortcut('delete')).toBe('Delete');
  });
});
