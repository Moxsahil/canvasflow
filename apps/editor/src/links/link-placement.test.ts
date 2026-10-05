import { describe, expect, it } from 'vitest';
import { createArrow, createRectangle, type Shape } from '@canvasflow/canvas-engine';
import {
  LINK_BADGE_MIN_ZOOM,
  LINK_BADGE_SIZE,
  linkBadgePlacements,
  linkBoxPlacement,
  linkTarget,
} from './link-placement';

const board = { width: 1200, height: 800 };
const box = { width: 300, height: 36 };
const selection = { x: 400, y: 300, width: 200, height: 100 };

describe('linkBoxPlacement', () => {
  it('centres the box under the selection, clear of its handles', () => {
    expect(linkBoxPlacement(selection, box, board, null)).toEqual({
      left: 350, // 400 + 100 − 150
      top: 300 + 100 + 8 + 12,
    });
  });

  it('goes above when the bottom of the board leaves no room', () => {
    const low = { ...selection, y: 620 };
    expect(linkBoxPlacement(low, box, board, null)?.top).toBe(620 - 8 - 12 - 36);
  });

  it('keeps to the bottom of the board for a selection too tall for either side', () => {
    const tall = { x: 100, y: 40, width: 600, height: 740 };
    expect(linkBoxPlacement(tall, box, board, null)?.top).toBe(800 - 68 - 36);
  });

  it('stays inside the board beside a selection at its edge', () => {
    expect(linkBoxPlacement({ ...selection, x: 0, width: 40 }, box, board, null)?.left).toBe(8);
    expect(linkBoxPlacement({ ...selection, x: 1180, width: 40 }, box, board, null)?.left).toBe(
      1200 - 300 - 8,
    );
  });

  it('keeps under the selection while the style bar is over it', () => {
    const halo = { x: 380, y: 300 - 8 - 12 - 36, width: 240, height: 36 };
    expect(linkBoxPlacement(selection, box, board, halo)?.top).toBe(420);
  });

  it('stacks under the style bar when the bar has been pushed below too', () => {
    const nearTop = { ...selection, y: 70 };
    const halo = { x: 380, y: 70 + 100 + 8 + 12, width: 240, height: 36 };
    expect(linkBoxPlacement(nearTop, box, board, halo)?.top).toBe(halo.y + 36 + 6);
  });

  it('has nowhere to be for a selection scrolled out of view', () => {
    expect(linkBoxPlacement({ ...selection, x: -500 }, box, board, null)).toBeNull();
    expect(linkBoxPlacement({ ...selection, y: 900 }, box, board, null)).toBeNull();
  });
});

describe('linkBadgePlacements', () => {
  const linked = (id: string, x: number, y: number, link = 'https://example.com/'): Shape => ({
    ...createRectangle({ id, x, y, width: 100, height: 50 }),
    link,
  });
  const camera = { x: 0, y: 0, zoom: 1 };

  it('sets a badge just off the top-right corner of each linked shape', () => {
    expect(linkBadgePlacements([linked('a', 100, 200)], camera, board, null)).toEqual([
      { id: 'a', link: 'https://example.com/', left: 200 + 4, top: 200 - 4 - LINK_BADGE_SIZE },
    ]);
  });

  it('follows the camera, keeping its own size', () => {
    const [badge] = linkBadgePlacements(
      [linked('a', 100, 200)],
      { x: 50, y: 100, zoom: 2 },
      board,
      null,
    );
    expect(badge).toMatchObject({ left: (200 - 50) * 2 + 4, top: (200 - 100) * 2 - 4 - 22 });
  });

  it('works from the bounds, so a line gets one as well as a box', () => {
    const arrow: Shape = {
      ...createArrow({
        id: 'l',
        x: 10,
        y: 10,
        points: [
          [0, 0],
          [90, 40],
        ],
      }),
      link: 'mailto:someone@example.com',
    };
    expect(linkBadgePlacements([arrow], camera, board, null)).toHaveLength(1);
  });

  it('leaves out shapes without a link, the one whose box is up, and those off screen', () => {
    const shapes = [
      createRectangle({ id: 'plain', x: 0, y: 100, width: 10, height: 10 }),
      linked('selected', 100, 100),
      linked('far', 5000, 100),
      linked('shown', 300, 100),
    ];
    expect(linkBadgePlacements(shapes, camera, board, 'selected').map((b) => b.id)).toEqual([
      'shown',
    ]);
  });

  it('puts every badge away when zoomed far out', () => {
    const zoom = LINK_BADGE_MIN_ZOOM / 2;
    expect(linkBadgePlacements([linked('a', 100, 200)], { ...camera, zoom }, board, null)).toEqual(
      [],
    );
  });
});

describe('linkTarget', () => {
  const origin = 'https://editor.example.com';

  it('opens a page of this app in place, and anything else in a new tab', () => {
    expect(linkTarget('https://editor.example.com/board/1', origin)).toBe('_self');
    expect(linkTarget('https://example.com/', origin)).toBe('_blank');
    expect(linkTarget('mailto:someone@example.com', origin)).toBe('_blank');
  });
});
