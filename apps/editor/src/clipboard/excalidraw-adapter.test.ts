import { describe, expect, it } from 'vitest';
import { excalidrawElementsToShapes } from './excalidraw-adapter';

let next = 0;
const genId = () => `id-${next++}`;

describe('excalidrawElementsToShapes', () => {
  it('brings a link across with the shape', () => {
    const [shape] = excalidrawElementsToShapes(
      [
        {
          id: 'e1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          link: 'https://example.com/',
        },
      ],
      genId,
    );
    expect(shape?.link).toBe('https://example.com/');
  });

  it('keeps the shape and drops a link this board would not open', () => {
    const shapes = excalidrawElementsToShapes(
      [
        { id: 'e1', type: 'rectangle', x: 0, y: 0, link: 'javascript:alert(1)' },
        { id: 'e2', type: 'ellipse', x: 0, y: 0, link: null },
      ],
      genId,
    );
    expect(shapes).toHaveLength(2);
    expect(shapes.every((shape) => shape.link === undefined)).toBe(true);
  });
});
