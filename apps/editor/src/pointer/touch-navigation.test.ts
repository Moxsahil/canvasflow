import { describe, expect, it } from 'vitest';
import {
  createTouchNavigator,
  MULTI_TAP_MS,
  TOUCH_TRAVEL_SLOP,
  type TouchNavigation,
} from './touch-navigation';

function recorder() {
  const calls: string[] = [];
  let panned = { x: 0, y: 0 };
  let zoomed = 1;
  const nav: TouchNavigation = {
    begin: () => calls.push('begin'),
    pan: (dx, dy) => {
      panned = { x: panned.x + dx, y: panned.y + dy };
    },
    zoom: (factor) => {
      zoomed *= factor;
    },
    end: () => calls.push('end'),
    cancel: () => calls.push('cancel'),
    undo: () => calls.push('undo'),
    redo: () => calls.push('redo'),
  };
  return { nav, calls, panned: () => panned, zoomed: () => zoomed };
}

describe('createTouchNavigator', () => {
  it('pans with one finger once it travels past the slop, when one finger may', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(1, { x: 100, y: 100 }, 0, true);
    fingers.move(1, { x: 100 + TOUCH_TRAVEL_SLOP / 2, y: 100 });
    expect(r.calls).toEqual([]);
    fingers.move(1, { x: 140, y: 120 });
    fingers.up(1, 500);
    expect(r.calls).toEqual(['begin', 'end']);
    // From where it landed, so the slop it crossed counts too.
    expect(r.panned()).toEqual({ x: 40, y: 20 });
  });

  it('leaves a single finger alone when panning takes two', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(1, { x: 100, y: 100 }, 0, false);
    fingers.move(1, { x: 200, y: 100 });
    fingers.up(1, 500);
    expect(r.calls).toEqual([]);
  });

  it('zooms by how far two fingers spread, and pans by where their middle goes', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(1, { x: 100, y: 100 }, 0, false);
    fingers.down(2, { x: 200, y: 100 }, 10, false);
    fingers.move(1, { x: 50, y: 100 });
    fingers.move(2, { x: 250, y: 100 });
    expect(r.zoomed()).toBeCloseTo(2);
    expect(r.panned()).toEqual({ x: 0, y: 0 });
    fingers.up(1, 400);
    // The finger left behind carries on panning, without a jump.
    fingers.move(2, { x: 270, y: 110 });
    expect(r.panned()).toEqual({ x: 20, y: 10 });
    fingers.up(2, 500);
    expect(r.calls).toEqual(['begin', 'end']);
  });

  it('reads a quick two-finger tap as undo, and three as redo', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(1, { x: 100, y: 100 }, 0, true);
    fingers.down(2, { x: 160, y: 100 }, 20, true);
    fingers.up(1, 120);
    fingers.up(2, 140);
    fingers.down(3, { x: 100, y: 100 }, 1000, true);
    fingers.down(4, { x: 150, y: 100 }, 1010, true);
    fingers.down(5, { x: 200, y: 100 }, 1030, true);
    for (const id of [3, 4, 5]) fingers.up(id, 1150);
    expect(r.calls).toEqual(['undo', 'redo']);
  });

  it('takes no tap from fingers held too long, or moved, or a single finger', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(1, { x: 100, y: 100 }, 0, false);
    fingers.down(2, { x: 160, y: 100 }, 0, false);
    fingers.up(1, MULTI_TAP_MS + 1);
    fingers.up(2, MULTI_TAP_MS + 1);
    fingers.down(3, { x: 100, y: 100 }, 1000, true);
    fingers.up(3, 1050);
    fingers.down(4, { x: 100, y: 100 }, 2000, false);
    fingers.down(5, { x: 160, y: 100 }, 2000, false);
    fingers.move(5, { x: 160 + TOUCH_TRAVEL_SLOP + 1, y: 100 });
    fingers.up(4, 2100);
    fingers.up(5, 2100);
    expect(r.calls).toEqual(['begin', 'end']);
  });

  it('puts the board back when a pencil interrupts, and hands over the touches', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(7, { x: 100, y: 100 }, 0, true);
    fingers.move(7, { x: 160, y: 100 });
    expect(fingers.interrupt()).toEqual([7]);
    expect(fingers.active()).toBe(false);
    // Its lift arrives later and finds nothing.
    fingers.up(7, 400);
    expect(r.calls).toEqual(['begin', 'cancel']);
  });

  it('interrupts a hand that has not moved the board without moving it back', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(7, { x: 100, y: 100 }, 0, true);
    fingers.interrupt();
    expect(r.calls).toEqual([]);
  });

  it('adopts a finger already drawing without jumping, and counts it toward a tap', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.adopt(1, { x: 120, y: 100 }, 0, false);
    fingers.down(2, { x: 180, y: 100 }, 40, false);
    fingers.up(1, 150);
    fingers.up(2, 160);
    expect(r.calls).toEqual(['undo']);

    // One that had already travelled is no tap, and pans from where it was taken.
    fingers.adopt(3, { x: 300, y: 100 }, 1000, true);
    fingers.down(4, { x: 400, y: 100 }, 1100, false);
    fingers.move(3, { x: 310, y: 100 });
    expect(r.panned()).toEqual({ x: 5, y: 0 });
  });

  it('counts a finger the system took away as no tap', () => {
    const r = recorder();
    const fingers = createTouchNavigator(r.nav);
    fingers.down(1, { x: 100, y: 100 }, 0, true);
    fingers.down(2, { x: 160, y: 100 }, 10, true);
    fingers.cancel(1, 50);
    fingers.up(2, 60);
    expect(r.calls).toEqual([]);
  });
});
