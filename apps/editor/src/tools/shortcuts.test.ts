import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './shortcuts';

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
