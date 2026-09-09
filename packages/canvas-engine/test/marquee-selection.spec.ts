import { describe, expect, it } from 'vitest';
import { hitTestMarquee, type MarqueeMode } from '../src/hit-testing/hit-test.js';
import {
  createDiamond,
  createEllipse,
  createFrame,
  createLine,
  createRectangle,
} from '../src/shapes/index.js';
import type { Shape } from '../src/shapes/shape.js';
import { SpatialIndex } from '../src/spatial/spatial-index.js';
import type { Rect } from '../src/math.js';

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

/** Ids the marquee takes, sorted so a test never depends on draw order. */
function selected(shapes: Shape[], marquee: Rect, mode?: MarqueeMode): string[] {
  const index = new SpatialIndex();
  index.rebuild(shapes);
  return hitTestMarquee(shapes, index, marquee, mode)
    .map((s) => s.id)
    .sort();
}

const box = createRectangle({ id: 'box', x: 0, y: 0, width: 100, height: 100 });

describe('hitTestMarquee — what a box takes', () => {
  it('takes an enclosed shape whichever way the preference is set', () => {
    const around = rect(-10, -10, 120, 120);
    expect(selected([box], around, 'wrap')).toEqual(['box']);
    expect(selected([box], around, 'overlap')).toEqual(['box']);
  });

  it('counts a shape flush against the sides of the box as enclosed', () => {
    expect(selected([box], rect(0, 0, 100, 100), 'wrap')).toEqual(['box']);
  });

  it('leaves a half-covered shape when the box only takes what it wraps', () => {
    expect(selected([box], rect(-10, -10, 60, 60), 'wrap')).toEqual([]);
  });

  it('takes a half-covered shape when the box takes what it touches', () => {
    expect(selected([box], rect(-10, -10, 60, 60), 'overlap')).toEqual(['box']);
  });

  it('takes what it touches unless told otherwise', () => {
    expect(selected([box], rect(-10, -10, 60, 60))).toEqual(['box']);
  });

  it('takes nothing from an empty board', () => {
    expect(selected([], rect(0, 0, 100, 100))).toEqual([]);
  });
});

describe('hitTestMarquee — shapes that do not fill their own bounds', () => {
  // Each of these sits in the corner of a shape's bounding box, where the box
  // overlaps but the mark on screen is somewhere else entirely.
  const corner = rect(-10, -10, 20, 20);

  it('leaves a diamond whose corner is empty', () => {
    const diamond = createDiamond({ id: 'diamond', x: 0, y: 0, width: 100, height: 100 });
    expect(selected([diamond], corner, 'overlap')).toEqual([]);
  });

  it('leaves an ellipse whose corner is empty', () => {
    const ellipse = createEllipse({ id: 'ellipse', x: 0, y: 0, width: 100, height: 100 });
    expect(selected([ellipse], corner, 'overlap')).toEqual([]);
  });

  it('leaves a diagonal line the box misses by a corner', () => {
    const line = createLine({
      id: 'line',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 100],
      ],
    });
    expect(selected([line], rect(0, 90, 20, 10), 'overlap')).toEqual([]);
  });

  it('still takes those shapes where the box crosses the mark itself', () => {
    const diamond = createDiamond({ id: 'diamond', x: 0, y: 0, width: 100, height: 100 });
    const ellipse = createEllipse({ id: 'ellipse', x: 0, y: 0, width: 100, height: 100 });
    const across = rect(40, -10, 20, 120);
    expect(selected([diamond], across, 'overlap')).toEqual(['diamond']);
    expect(selected([ellipse], across, 'overlap')).toEqual(['ellipse']);
  });
});

describe('hitTestMarquee — frames', () => {
  const frame = createFrame({ id: 'frame', x: 0, y: 0, width: 200, height: 200 });

  it('leaves a frame the box only clips', () => {
    expect(selected([frame], rect(-10, -10, 60, 60), 'overlap')).toEqual([]);
  });

  it('takes a frame the box encloses', () => {
    expect(selected([frame], rect(-10, -10, 220, 220), 'overlap')).toEqual(['frame']);
  });

  it('takes what stands in a frame without taking the frame', () => {
    const inner = createRectangle({ id: 'inner', x: 20, y: 20, width: 40, height: 40 });
    expect(selected([frame, inner], rect(10, 10, 60, 60), 'overlap')).toEqual(['inner']);
  });
});
