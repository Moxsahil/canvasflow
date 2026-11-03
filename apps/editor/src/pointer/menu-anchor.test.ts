import { describe, expect, it } from 'vitest';
import { menuAnchorX } from './usePointerEvents';

describe('menuAnchorX', () => {
  it('opens from the press when the menu fits beside it', () => {
    expect(menuAnchorX(100, 1440)).toBe(100);
    expect(menuAnchorX(1300, 1440)).toBe(1300);
    expect(menuAnchorX(60, 393)).toBe(60);
    expect(menuAnchorX(330, 393)).toBe(330);
  });

  it('moves the anchor in when neither side has room', () => {
    expect(menuAnchorX(180, 375)).toBe(375 - 252);
    expect(menuAnchorX(200, 393)).toBe(393 - 252);
  });
});
