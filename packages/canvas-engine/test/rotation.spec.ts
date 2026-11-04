import { describe, expect, it } from 'vitest';
import { hitTest, hitTestMarquee } from '../src/hit-testing/hit-test.js';
import { renderSceneToSvgString } from '../src/renderers/svg-scene.js';
import {
  createArrow,
  createLine,
  createRectangle,
  flipShape,
  fromShapeFrame,
  normalizeAngle,
  normalizedAnchorFor,
  outlineCrossing,
  rotateHandlePosition,
  shapeBounds,
  shapeBox,
  shapeContainsPoint,
  toShapeFrame,
} from '../src/shapes/index.js';
import type { Shape } from '../src/shapes/shape.js';
import { SpatialIndex } from '../src/spatial/spatial-index.js';

const QUARTER = Math.PI / 2;
const EIGHTH = Math.PI / 4;

/** 200 × 40, centred on (100, 20). */
const bar = (rotation = 0) =>
  createRectangle({ id: 'bar', x: 0, y: 0, width: 200, height: 40, rotation, seed: 1 });

function at(shapes: Shape[], x: number, y: number): string | null {
  const index = new SpatialIndex();
  index.rebuild(shapes);
  return hitTest(shapes, index, x, y, 1)?.id ?? null;
}

describe('a turned shape', () => {
  it('keeps its box and covers the box round its turned corners', () => {
    const turned = bar(QUARTER);
    expect(shapeBox(turned)).toEqual({ x: 0, y: 0, width: 200, height: 40 });
    const b = shapeBounds(turned);
    expect(b.x).toBeCloseTo(80);
    expect(b.y).toBeCloseTo(-80);
    expect(b.width).toBeCloseTo(40);
    expect(b.height).toBeCloseTo(200);
  });

  it('is pressed where it is drawn, not where it stood upright', () => {
    const turned = { ...bar(QUARTER), fillColor: '#000000' };
    // Far end of the upright bar: empty once it is turned upright.
    expect(at([turned], 190, 20)).toBeNull();
    // The turned bar's lower end.
    expect(at([turned], 100, 110)).toBe('bar');
  });

  it('contains points in its own frame', () => {
    const turned = bar(QUARTER);
    expect(shapeContainsPoint(turned, 100, -70)).toBe(true);
    expect(shapeContainsPoint(turned, 180, 20)).toBe(false);
  });

  it('turns points into and out of its frame', () => {
    const turned = bar(EIGHTH);
    const point = { x: 150, y: 60 };
    const back = fromShapeFrame(turned, toShapeFrame(turned, point));
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it('is left alone by a marquee that holds only its upright box', () => {
    const shapes = [bar(QUARTER)];
    const index = new SpatialIndex();
    index.rebuild(shapes);
    expect(hitTestMarquee(shapes, index, { x: -5, y: -5, width: 210, height: 50 }, 'wrap')).toEqual(
      [],
    );
    expect(
      hitTestMarquee(shapes, index, { x: 70, y: -90, width: 60, height: 220 }, 'wrap'),
    ).toHaveLength(1);
  });

  it('stops an arrow at its turned outline', () => {
    const turned = bar(QUARTER);
    // From the right, level with the middle: meets the turned bar's side at x = 120.
    const hit = outlineCrossing(turned, { x: 300, y: 20 }, { x: 100, y: 20 });
    expect(hit!.x).toBeCloseTo(120);
    expect(hit!.y).toBeCloseTo(20);
  });

  it('keeps an attached spot on the same part of the shape as it turns', () => {
    const upright = bar();
    const anchor = normalizedAnchorFor(upright, { x: 200, y: 20 });
    expect(anchor).toEqual({ x: 1, y: 0.5 });
    const turned = bar(QUARTER);
    // The right end of the bar is now its bottom.
    const spot = fromShapeFrame(turned, { x: 200, y: 20 });
    expect(spot.x).toBeCloseTo(100);
    expect(spot.y).toBeCloseTo(120);
    const again = normalizedAnchorFor(turned, spot);
    expect(again.x).toBeCloseTo(1);
    expect(again.y).toBeCloseTo(0.5);
  });

  it('puts its turning handle above whatever was its top', () => {
    expect(rotateHandlePosition(bar(), 1)).toEqual({ x: 100, y: -24 });
    const side = rotateHandlePosition(bar(QUARTER), 1)!;
    // A quarter turn clockwise carries the top round to the right.
    expect(side.x).toBeCloseTo(144);
    expect(side.y).toBeCloseTo(20);
  });

  it('has no turning handle when it is a line or an arrow', () => {
    const line = createLine({
      id: 'l',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [10, 10],
      ],
    });
    const arrow = createArrow({
      id: 'a',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [10, 10],
      ],
    });
    expect(rotateHandlePosition(line, 1)).toBeNull();
    expect(rotateHandlePosition(arrow, 1)).toBeNull();
  });

  it('turns the other way when it is mirrored', () => {
    const flipped = flipShape(bar(EIGHTH), 'horizontal', { x: 100, y: 20 });
    expect(flipped.rotation).toBeCloseTo(normalizeAngle(-EIGHTH));
  });

  it('is turned in an exported SVG', () => {
    const svg = renderSceneToSvgString([bar(QUARTER)], { padding: 0 });
    expect(svg).toContain('transform="rotate(90 100 20)"');
  });
});

describe('normalizeAngle', () => {
  it('brings any angle into one turn', () => {
    expect(normalizeAngle(-QUARTER)).toBeCloseTo(3 * QUARTER);
    expect(normalizeAngle(5 * QUARTER)).toBeCloseTo(QUARTER);
    expect(normalizeAngle(Math.PI * 2)).toBe(0);
  });
});
