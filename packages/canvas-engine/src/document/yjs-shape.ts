import * as Y from 'yjs';
import type { Shape } from '../shapes/shape.js';
import { DEFAULT_STROKE_COLOR } from '../shapes/style.js';
import type {
  Arrowhead,
  ArrowType,
  Edges,
  FillStyle,
  Roughness,
  StrokeStyle,
} from '../shapes/style.js';

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
  map.set('fillStyle', shape.fillStyle);
  map.set('strokeWidth', shape.strokeWidth);
  map.set('strokeStyle', shape.strokeStyle);
  map.set('roughness', shape.roughness);
  map.set('opacity', shape.opacity);
  map.set('seed', shape.seed);

  // Fractional-indexing zIndex — added by document layer, not shape factories
  const zIndex = (shape as Shape & { zIndex?: string }).zIndex;
  if (zIndex !== undefined) {
    map.set('zIndex', zIndex);
  }

  if (shape.lastEditedBy !== undefined) {
    map.set('lastEditedBy', shape.lastEditedBy);
  }
  if (shape.lastEditedAt !== undefined) {
    map.set('lastEditedAt', shape.lastEditedAt);
  }

  // Shape-kind-specific fields
  switch (shape.kind) {
    case 'rectangle':
    case 'diamond':
      map.set('width', shape.width);
      map.set('height', shape.height);
      map.set('edges', shape.edges);
      break;
    case 'ellipse':
      map.set('width', shape.width);
      map.set('height', shape.height);
      break;
    case 'line':
      map.set('points', shape.points);
      map.set('edges', shape.edges);
      break;
    case 'freehand':
      map.set('points', shape.points);
      map.set('edges', shape.edges);
      map.set('simulatePressure', shape.simulatePressure);
      break;
    case 'arrow':
      map.set('points', shape.points);
      map.set('startArrowhead', shape.startArrowhead);
      map.set('endArrowhead', shape.endArrowhead);
      map.set('arrowType', shape.arrowType);
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
 * Coerce a stored `text` value to a string.
 *
 * A board was found in the wild holding `Y.Text` instances here rather than
 * plain strings. Because `??` only catches null/undefined, those flowed through
 * as objects and the first `.split()` downstream threw — taking the whole board
 * down with a white screen. Deserialization is the one place every external
 * value enters, so it is the right place to guarantee the type.
 */
function readTextValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  // Y.Text and friends stringify to their content.
  return String(value);
}

/**
 * Convert a Y.Map back into a plain Shape object.
 * Reads every field and reconstructs the discriminated union properly.
 */
export function yMapToShape(map: Y.Map<unknown>): Shape | null {
  const kind = map.get('kind');
  if (typeof kind !== 'string') return null;

  const lastEditedByRaw = map.get('lastEditedBy');
  const lastEditedAtRaw = map.get('lastEditedAt');

  // Every `??` here is the upgrade path for boards persisted before the field
  // existed; the defaults match the shape factories.
  const base = {
    id: map.get('id') as string,
    x: map.get('x') as number,
    y: map.get('y') as number,
    rotation: (map.get('rotation') as number) ?? 0,
    strokeColor: (map.get('strokeColor') as string) ?? DEFAULT_STROKE_COLOR,
    fillColor: (map.get('fillColor') as string | null) ?? null,
    fillStyle: (map.get('fillStyle') as FillStyle) ?? 'hachure',
    strokeWidth: (map.get('strokeWidth') as number) ?? 2,
    strokeStyle: (map.get('strokeStyle') as StrokeStyle) ?? 'solid',
    roughness: (map.get('roughness') as Roughness) ?? 1,
    opacity: (map.get('opacity') as number) ?? 100,
    seed: (map.get('seed') as number) ?? 0,
    ...(typeof lastEditedByRaw === 'string' && { lastEditedBy: lastEditedByRaw }),
    ...(typeof lastEditedAtRaw === 'number' && { lastEditedAt: lastEditedAtRaw }),
  };

  const edges = (map.get('edges') as Edges) ?? 'sharp';

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
        edges,
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
        edges,
      } as Shape);
    case 'line':
      return withZ({
        ...base,
        kind: 'line',
        points: map.get('points') as ReadonlyArray<readonly [number, number]>,
        edges,
      } as Shape);
    case 'arrow':
      return withZ({
        ...base,
        kind: 'arrow',
        points: map.get('points') as ReadonlyArray<readonly [number, number]>,
        startArrowhead: (map.get('startArrowhead') as Arrowhead) ?? 'none',
        endArrowhead: (map.get('endArrowhead') as Arrowhead) ?? 'arrow',
        arrowType: (map.get('arrowType') as ArrowType) ?? 'straight',
      } as Shape);
    case 'freehand':
      return withZ({
        ...base,
        kind: 'freehand',
        points: map.get('points') as ReadonlyArray<readonly [number, number]>,
        // Strokes drawn before this field existed were rendered untapered.
        edges: (map.get('edges') as Edges) ?? 'round',
        simulatePressure: (map.get('simulatePressure') as boolean) ?? false,
      } as Shape);
    case 'text':
      return withZ({
        ...base,
        kind: 'text',
        text: readTextValue(map.get('text')),
        fontSize: (map.get('fontSize') as number) ?? 20,
        fontFamily: (map.get('fontFamily') as string) ?? 'system-ui',
        textAlign: (map.get('textAlign') as 'left' | 'center' | 'right') ?? 'left',
      } as Shape);
    default:
      return null;
  }
}
