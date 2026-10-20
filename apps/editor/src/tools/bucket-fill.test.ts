import { describe, expect, it } from 'vitest';
import { createFrame, createLine, createRectangle, type Shape } from '@canvasflow/canvas-engine';
import { planBucketFill, type BucketStyle } from './bucket-fill';

const style: BucketStyle = { fillColor: '#b2f2bb', fillStyle: 'solid', opacity: 100 };
const rect = (id: string, x: number, y: number, size: number) =>
  createRectangle({ id, x, y, width: size, height: size, seed: 1 });

const plan = (shapes: Shape[], point = { x: 50, y: 50 }, hit: Shape | null = null) =>
  planBucketFill({ point, shapes, hit, style, id: 'fill' });

describe('planBucketFill', () => {
  it('pours a strokeless fill below the outline it fills', () => {
    const outcome = plan([rect('r', 0, 0, 100)]);
    expect(outcome.kind).toBe('create');
    if (outcome.kind !== 'create') return;
    expect(outcome.placement).toEqual({ placement: 'below', shapeId: 'r' });
    expect(outcome.shape).toMatchObject({
      id: 'fill',
      kind: 'line',
      strokeColor: 'transparent',
      fillColor: '#b2f2bb',
      fillStyle: 'solid',
      opacity: 100,
      roughness: 0,
      edges: 'sharp',
    });
  });

  it('recolours a fill clicked again instead of stacking another', () => {
    const r = rect('r', 0, 0, 100);
    const first = plan([r]);
    if (first.kind !== 'create') throw new Error('no fill');
    const fill = { ...first.shape, fillColor: '#ffc9c9' };
    const outcome = plan([fill, r], { x: 50, y: 50 }, fill);
    expect(outcome).toEqual({ kind: 'restyle', id: 'fill', patch: { fillColor: '#b2f2bb' } });
  });

  it('does nothing to a fill that already looks like this', () => {
    const r = rect('r', 0, 0, 100);
    const first = plan([r]);
    if (first.kind !== 'create') throw new Error('no fill');
    expect(plan([first.shape, r], { x: 50, y: 50 }, first.shape)).toEqual({ kind: 'none' });
  });

  it('recolours a fill whose outlines are gone', () => {
    const orphan = createLine({
      id: 'orphan',
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
      strokeColor: 'transparent',
      fillColor: '#a5d8ff',
      fillStyle: 'solid',
    });
    expect(plan([orphan], { x: 50, y: 50 }, orphan)).toEqual({
      kind: 'restyle',
      id: 'orphan',
      patch: { fillColor: '#b2f2bb' },
    });
  });

  it('says nothing on open board', () => {
    expect(plan([rect('r', 0, 0, 100)], { x: 500, y: 500 })).toEqual({ kind: 'none' });
  });

  it('says so when the area found is too small to fill', () => {
    expect(plan([rect('r', 0, 0, 1)], { x: 0.5, y: 0.5 })).toEqual({
      kind: 'notice',
      reason: 'noRegion',
    });
  });

  it('pours into the frame it lands in, above the frame', () => {
    const frame = createFrame({ id: 'f', x: -50, y: -50, width: 300, height: 300 });
    const r = { ...rect('r', 0, 0, 100), frameId: 'f' };
    const outcome = plan([frame, r]);
    expect(outcome.kind).toBe('create');
    if (outcome.kind !== 'create') return;
    expect(outcome.shape.frameId).toBe('f');
    // Below the rectangle would still be above the frame here.
    expect(outcome.placement).toEqual({ placement: 'below', shapeId: 'r' });
  });

  it('lifts a fill of the frame itself above the frame', () => {
    const frame = createFrame({ id: 'f', x: 0, y: 0, width: 200, height: 200 });
    const outcome = plan([frame], { x: 100, y: 100 });
    expect(outcome.kind).toBe('create');
    if (outcome.kind !== 'create') return;
    expect(outcome.shape.frameId).toBe('f');
    expect(outcome.placement).toEqual({ placement: 'above', shapeId: 'f' });
  });
});
