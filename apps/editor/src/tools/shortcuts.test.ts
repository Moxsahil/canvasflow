import { describe, expect, it } from 'vitest';
import { flipAxisForShortcut, isTypingTarget } from './shortcuts';

/** As much of an element as the check reads. */
function element(tagName: string, extra: { type?: string; isContentEditable?: boolean } = {}) {
  return { tagName, ...extra } as unknown as EventTarget;
}

describe('isTypingTarget', () => {
  it('counts the places text is typed', () => {
    expect(isTypingTarget(element('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(element('INPUT', { type: 'text' }))).toBe(true);
    expect(isTypingTarget(element('INPUT', { type: 'search' }))).toBe(true);
    expect(isTypingTarget(element('SELECT'))).toBe(true);
    expect(isTypingTarget(element('DIV', { isContentEditable: true }))).toBe(true);
  });

  it('does not count an input that takes no text, which keeps focus after a click', () => {
    for (const type of ['radio', 'checkbox', 'range']) {
      expect(isTypingTarget(element('INPUT', { type }))).toBe(false);
    }
  });

  it('does not count the board, a button, or nothing at all', () => {
    expect(isTypingTarget(element('CANVAS'))).toBe(false);
    expect(isTypingTarget(element('BUTTON'))).toBe(false);
    expect(isTypingTarget(element('BODY'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('flipAxisForShortcut', () => {
  const horizontal = {
    code: 'KeyH',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
    target: null,
  };

  it('recognizes Shift+H and Shift+V by physical key code', () => {
    expect(flipAxisForShortcut(horizontal)).toBe('horizontal');
    expect(flipAxisForShortcut({ ...horizontal, code: 'KeyV' })).toBe('vertical');
    expect(flipAxisForShortcut({ ...horizontal, code: 'KeyC' })).toBeNull();
  });

  it('requires Shift alone, leaving bare tool keys and platform shortcuts untouched', () => {
    expect(flipAxisForShortcut({ ...horizontal, shiftKey: false })).toBeNull();
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
      for (const code of ['KeyH', 'KeyV']) {
        expect(flipAxisForShortcut({ ...horizontal, code, [modifier]: true })).toBeNull();
      }
    }
  });

  it('leaves typed capital letters to fields and contenteditable elements', () => {
    for (const target of [
      element('INPUT', { type: 'text' }),
      element('TEXTAREA'),
      element('SELECT'),
      element('DIV', { isContentEditable: true }),
    ]) {
      expect(flipAxisForShortcut({ ...horizontal, target })).toBeNull();
    }
  });

  it('works with focus on the canvas or a toolbar button', () => {
    for (const target of [
      element('CANVAS'),
      element('BUTTON'),
      element('INPUT', { type: 'radio' }),
    ]) {
      expect(flipAxisForShortcut({ ...horizontal, target })).toBe('horizontal');
    }
  });
});
