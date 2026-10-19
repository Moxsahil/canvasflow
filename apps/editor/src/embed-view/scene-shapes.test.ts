import { describe, expect, it } from 'vitest';
import { sceneShapes, shapeLink } from './scene-shapes';

const rectangle = (fields: Record<string, unknown>) => ({
  id: 'r',
  kind: 'rectangle',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  rotation: 0,
  strokeColor: '#1e1e1e',
  fillColor: null,
  fillStyle: 'solid',
  strokeWidth: 1,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 1,
  seed: 1,
  edges: 'sharp',
  ...fields,
});

describe('sceneShapes', () => {
  it('reads nothing from something that is not a list', () => {
    expect(sceneShapes(null)).toEqual([]);
    expect(sceneShapes({ shapes: [] })).toEqual([]);
  });

  it('reads the shapes back in the board’s own order, skipping what is not one', () => {
    const shapes = sceneShapes([
      rectangle({ id: 'top', zIndex: 'a2' }),
      'not a shape',
      null,
      rectangle({ id: 'bottom', zIndex: 'a1' }),
    ]);
    expect(shapes.map((shape) => shape.id)).toEqual(['bottom', 'top']);
  });

  it('opens only the links the editor would open', () => {
    const [safe, unsafe] = sceneShapes([
      rectangle({ id: 'a', link: 'https://example.com/' }),
      rectangle({ id: 'b', link: 'javascript:alert(1)' }),
    ]);
    expect(shapeLink(safe!)).toBe('https://example.com/');
    expect(shapeLink(unsafe!)).toBeNull();
  });
});
