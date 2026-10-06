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

describe('excalidrawElementsToShapes, for whole drawings', () => {
  const base = { strokeColor: '#1e1e1e', backgroundColor: 'transparent' };

  it('keeps the style: fill, stroke, roughness, opacity and rounded corners', () => {
    const [shape] = excalidrawElementsToShapes(
      [
        {
          ...base,
          id: 'r',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          backgroundColor: '#ffec99',
          fillStyle: 'zigzag',
          strokeStyle: 'dashed',
          roughness: 0,
          opacity: 50,
          roundness: { type: 3 },
        },
      ],
      genId,
    );
    expect(shape).toMatchObject({
      kind: 'rectangle',
      fillColor: '#ffec99',
      fillStyle: 'hachure',
      strokeStyle: 'dashed',
      roughness: 0,
      opacity: 50,
      edges: 'round',
    });
  });

  it('makes old pure black the default pen, which turns light on a dark board', () => {
    const [shape] = excalidrawElementsToShapes(
      [{ id: 'r', type: 'rectangle', x: 0, y: 0, strokeColor: '#000000' }],
      genId,
    );
    expect(shape?.strokeColor).toBe('#1e1e1e');
  });

  it('leaves out deleted elements, images, and lines whose points are not numbers', () => {
    const shapes = excalidrawElementsToShapes(
      [
        { id: 'a', type: 'rectangle', x: 0, y: 0, isDeleted: true },
        { id: 'b', type: 'image', x: 0, y: 0 },
        {
          id: 'c',
          type: 'line',
          x: 0,
          y: 0,
          points: [
            [0, 'x' as never],
            [1, 1],
          ],
        },
        { id: 'd', type: 'ellipse', x: 0, y: 0 },
      ],
      genId,
    );
    expect(shapes.map((shape) => shape.kind)).toEqual(['ellipse']);
  });

  it('reads the oldest name for a freehand stroke, and frames with their names', () => {
    const shapes = excalidrawElementsToShapes(
      [
        {
          id: 'a',
          type: 'draw',
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [5, 5],
          ],
        },
        { id: 'b', type: 'frame', x: 0, y: 0, width: 100, height: 80, name: 'Login' },
      ],
      genId,
    );
    expect(shapes[0]?.kind).toBe('freehand');
    expect(shapes[1]).toMatchObject({ kind: 'frame', name: 'Login', width: 100 });
  });

  it('attaches arrow ends to the shapes that came along, and lets go of the rest', () => {
    const shapes = excalidrawElementsToShapes(
      [
        { id: 'box', type: 'rectangle', x: 0, y: 0, width: 50, height: 50 },
        {
          id: 'arrow',
          type: 'arrow',
          x: 50,
          y: 25,
          points: [
            [0, 0],
            [100, 0],
          ],
          startBinding: { elementId: 'box' },
          endBinding: { elementId: 'elsewhere' },
          endArrowhead: 'arrow',
        },
      ],
      genId,
    );
    const [box, arrow] = shapes;
    expect(arrow).toMatchObject({
      kind: 'arrow',
      startBinding: { shapeId: box!.id, anchor: { x: 0.5, y: 0.5 }, precise: false },
      endBinding: null,
      startArrowhead: 'none',
      endArrowhead: 'arrow',
    });
  });

  it('makes text written on an arrow its label', () => {
    const shapes = excalidrawElementsToShapes(
      [
        {
          id: 'arrow',
          type: 'arrow',
          x: 0,
          y: 0,
          points: [
            [0, 0],
            [100, 0],
          ],
        },
        { id: 't', type: 'text', x: 40, y: -10, text: 'calls', containerId: 'arrow' },
      ],
      genId,
    );
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ kind: 'arrow', label: 'calls' });
  });

  it('makes text written in a box the box’s own words, in their font', () => {
    const shapes = excalidrawElementsToShapes(
      [
        { id: 'b', type: 'rectangle', x: 0, y: 0, width: 120, height: 60 },
        {
          id: 't',
          type: 'text',
          x: 30,
          y: 20,
          width: 60,
          text: 'Server',
          containerId: 'b',
          fontSize: 16,
          fontFamily: 2,
          textAlign: 'center',
        },
      ],
      genId,
    );
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ kind: 'rectangle', label: 'Server', fontSize: 16 });
    expect((shapes[0] as { fontFamily: string }).fontFamily).toContain('Helvetica');
  });

  it('places centred text by its middle, so it stays centred in its box', () => {
    const [text] = excalidrawElementsToShapes(
      [
        {
          id: 't',
          type: 'text',
          x: 20,
          y: 10,
          width: 60,
          text: 'Wrapped\ntext',
          originalText: 'Wrapped text',
          textAlign: 'center',
          fontFamily: 5,
        },
      ],
      genId,
    );
    expect(text).toMatchObject({ kind: 'text', x: 50, text: 'Wrapped text', textAlign: 'center' });
    expect((text as { fontFamily: string }).fontFamily).toContain('Caveat');
  });
});
