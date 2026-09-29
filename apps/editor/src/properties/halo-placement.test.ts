import { describe, expect, it } from 'vitest';
import { haloPlacement } from './halo-placement';

const board = { width: 1200, height: 800 };
const bar = { width: 300, height: 36 };

describe('haloPlacement', () => {
  it('centres the bar over the selection, clear of its handles', () => {
    const place = haloPlacement({ x: 400, y: 300, width: 200, height: 100 }, bar, board);
    expect(place.side).toBe('above');
    expect(place.left).toBe(350); // 400 + 100 − 150
    expect(place.top).toBe(300 - 8 - 12 - 36);
  });

  it('goes underneath when the top of the board leaves no room', () => {
    const place = haloPlacement({ x: 400, y: 70, width: 200, height: 100 }, bar, board);
    expect(place.side).toBe('below');
    expect(place.top).toBe(70 + 100 + 8 + 12);
  });

  it('keeps to the top of the board for a selection too tall for either side', () => {
    const place = haloPlacement({ x: 100, y: 40, width: 600, height: 700 }, bar, board);
    expect(place).toMatchObject({ side: 'above', top: 64, opensUp: false });
  });

  it('stays inside the board beside a selection at its edge', () => {
    expect(haloPlacement({ x: 0, y: 300, width: 40, height: 40 }, bar, board).left).toBe(8);
    expect(haloPlacement({ x: 1180, y: 300, width: 40, height: 40 }, bar, board).left).toBe(
      1200 - 300 - 8,
    );
  });

  it('docks above the toolbar with nothing selected', () => {
    const place = haloPlacement(null, bar, board);
    expect(place).toMatchObject({ side: 'dock', left: 450, opensUp: true });
    expect(place.top).toBe(800 - 68 - 36);
  });

  it('docks too when the selection has been scrolled out of view', () => {
    expect(haloPlacement({ x: -500, y: 300, width: 100, height: 100 }, bar, board).side).toBe(
      'dock',
    );
  });

  it('opens its menus towards whichever side has more room', () => {
    expect(haloPlacement({ x: 400, y: 600, width: 100, height: 60 }, bar, board).opensUp).toBe(
      true,
    );
    expect(haloPlacement({ x: 400, y: 120, width: 100, height: 60 }, bar, board).opensUp).toBe(
      false,
    );
  });
});
