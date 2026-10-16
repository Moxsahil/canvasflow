import { afterEach, describe, expect, it } from 'vitest';
import {
  DOUBLE_PRESS_MS,
  carryRename,
  forgetPresses,
  isSecondPress,
  takeCarriedRename,
} from './double-press';

const press = (at: number, detail = 1) => ({ detail, timeStamp: at });

afterEach(forgetPresses);

describe('isSecondPress', () => {
  it('takes two quick presses on the same board for a double press', () => {
    expect(isSecondPress('a', press(1000))).toBe(false);
    expect(isSecondPress('a', press(1200))).toBe(true);
  });

  it('starts again after a double press, so a third press is a first', () => {
    isSecondPress('a', press(1000));
    isSecondPress('a', press(1100));
    expect(isSecondPress('a', press(1200))).toBe(false);
  });

  it('does not join presses on different boards, or ones too far apart', () => {
    isSecondPress('a', press(1000));
    expect(isSecondPress('b', press(1100))).toBe(false);
    expect(isSecondPress('b', press(1100 + DOUBLE_PRESS_MS + 1))).toBe(false);
  });

  it('never counts a press from the keyboard', () => {
    isSecondPress('a', press(1000, 0));
    expect(isSecondPress('a', press(1100, 0))).toBe(false);
    expect(isSecondPress('a', press(1150))).toBe(false);
  });
});

describe('carryRename', () => {
  it('hands the board over once, to the sidebar that comes up next', () => {
    carryRename('b1');
    expect(takeCarriedRename()).toBe('b1');
    expect(takeCarriedRename()).toBeNull();
  });
});
