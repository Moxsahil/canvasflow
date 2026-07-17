import * as Y from 'yjs';
import type { Shape } from '../shapes/shape.js';

/**
 * Convert a Shape (plain object) into a Y.Map for insertion into a Y.Doc.
 * Copies every property. The Y.Map inside the Y.Doc becomes the canonical
 * representation once inserted.
 */
export function shapeToYMap(shape: Shape): Y.Map<unknown> {
  const map = new Y.Map<unknown>();

  // Common BaseShape fields
  map.set('id', shape.id);
  map.set('kind', shape.kind);
  map.set('x', shape.x);
  map.set('y', shape.y);
  map.set('rotation', shape.rotation);
  map.set('strokeColor', shape.strokeColor);
  map.set('fillColor', shape.fillColor);
  map.set('strokeWidth', shape.strokeWidth);
  map.set('seed', shape.seed);

  // Fractional-indexing zIndex — added by document layer, not shape factories
  const zIndex = (shape as Shape & { zIndex?: string }).zIndex;
  if (zIndex !== undefined) {
    map.set('zIndex', zIndex);
  }

  // Shape-kind-specific fields
  switch (shape.kind) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      map.set('width', shape.width);
      map.set('height', shape.height);
      break;
    case 'line':
    case 'freehand':
      map.set('points', shape.points);
      break;
    case 'arrow':
      map.set('points', shape.points);
      map.set('startArrowhead', shape.startArrowhead);
      map.set('endArrowhead', shape.endArrowhead);
      break;
    case 'text':
      map.set('text', shape.text);
      map.set('fontSize', shape.fontSize);
      map.set('fontFamily', shape.fontFamily);
      map.set('textAlign', shape.textAlign);
      break;
  }

  return map;
}

/**
 * Convert a Y.Map back into a plain Shape object.
 * Reads every field and reconstructs the discriminated union properly.
 */
export function yMapToShape(map: Y.Map<unknown>): Shape | null {
  const kind = map.get('kind');
  if (typeof kind !== 'string') return null;

  const base = {
    id: map.get('id') as string,
    x: map.get('x') as number,
    y: map.get('y') as number,
    rotation: (map.get('rotation') as number) ?? 0,
    strokeColor: (map.get('strokeColor') as string) ?? '#1e293b',
    fillColor: (map.get('fillColor') as string | null) ?? null,
    strokeWidth: (map.get('strokeWidth') as number) ?? 2,
    seed: (map.get('seed') as number) ?? 0,
  };

  const zIndex = map.get('zIndex');
  const withZ = (shape: Shape): Shape =>
    zIndex !== undefined ? ({ ...shape, zIndex } as Shape & { zIndex: string }) : shape;

  switch (kind) {
    case 'rectangle':
      return withZ({
        ...base,
        kind: 'rectangle',
        width: map.get('width') as number,
        height: map.get('height') as number,
      } as Shape);
    case 'ellipse':
      return withZ({
        ...base,
        kind: 'ellipse',
        width: map.get('width') as number,
        height: map.get('height') as number,
      } as Shape);
    case 'diamond':
      return withZ({
        ...base,
        kind: 'diamond',
        width: map.get('width') as number,
        height: map.get('height') as number,
      } as Shape);
    case 'line':
      return withZ({
        ...base,
        kind: 'line',
        points: map.get('points') as ReadonlyArray<readonly [number, number]>,
      } as Shape);
    case 'arrow':
      return withZ({
        ...base,
        kind: 'arrow',
        points: map.get('points') as ReadonlyArray<readonly [number, number]>,
        startArrowhead: (map.get('startArrowhead') as 'none' | 'triangle') ?? 'none',
        endArrowhead: (map.get('endArrowhead') as 'none' | 'triangle') ?? 'triangle',
      } as Shape);
    case 'freehand':
      return withZ({
        ...base,
        kind: 'freehand',
        points: map.get('points') as ReadonlyArray<readonly [number, number]>,
      } as Shape);
    case 'text':
      return withZ({
        ...base,
        kind: 'text',
        text: (map.get('text') as string) ?? '',
        fontSize: (map.get('fontSize') as number) ?? 20,
        fontFamily: (map.get('fontFamily') as string) ?? 'system-ui',
        textAlign: (map.get('textAlign') as 'left' | 'center' | 'right') ?? 'left',
      } as Shape);
    default:
      return null;
  }
}
