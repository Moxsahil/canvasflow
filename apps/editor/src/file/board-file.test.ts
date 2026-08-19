import { describe, expect, it } from 'vitest';
import { isText, type Shape } from '@canvasflow/canvas-engine';
import { BoardFileError, parseBoardFile, serializeBoardFile } from './board-file';

let counter = 0;
const genId = () => `test-${(counter += 1)}`;

const rectangle = {
  kind: 'rectangle',
  id: 'original-id',
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  strokeColor: '#1e1e1e',
};

function boardFile(shapes: unknown[], extra: Record<string, unknown> = {}) {
  return JSON.stringify({ type: 'canvasflow/board', version: 1, shapes, ...extra });
}

describe('parseBoardFile — our own format', () => {
  it('loads shapes and fills in engine defaults', () => {
    const { shapes, skipped, format } = parseBoardFile(boardFile([rectangle]), genId);
    expect(format).toBe('canvasflow');
    expect(skipped).toBe(0);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ kind: 'rectangle', x: 10, y: 20, width: 100, height: 50 });
    // Defaults the file never mentioned.
    expect(shapes[0]?.opacity).toBe(100);
    expect(shapes[0]?.fillStyle).toBe('hachure');
  });

  it('regenerates ids so a file cannot collide with the document', () => {
    const { shapes } = parseBoardFile(boardFile([rectangle, rectangle]), genId);
    expect(shapes[0]?.id).not.toBe('original-id');
    expect(shapes[0]?.id).not.toBe(shapes[1]?.id);
  });

  it('carries the canvas background when the file has one', () => {
    const { canvasBackground } = parseBoardFile(
      boardFile([rectangle], { canvasBackground: '#fffce8' }),
      genId,
    );
    expect(canvasBackground).toBe('#fffce8');
  });

  it('refuses a file from a newer version rather than guessing', () => {
    expect(() => parseBoardFile(boardFile([], { version: 99 }), genId)).toThrow(BoardFileError);
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseBoardFile('<html>nope</html>', genId)).toThrow(BoardFileError);
  });

  it('rejects JSON that is not a board', () => {
    expect(() => parseBoardFile(JSON.stringify({ type: 'something/else' }), genId)).toThrow(
      BoardFileError,
    );
  });

  it('round-trips what serializeBoardFile writes', () => {
    const { shapes } = parseBoardFile(boardFile([rectangle]), genId);
    const reparsed = parseBoardFile(serializeBoardFile(shapes, '#ffffff'), genId);
    expect(reparsed.shapes[0]).toMatchObject({ kind: 'rectangle', x: 10, y: 20 });
    expect(reparsed.canvasBackground).toBe('#ffffff');
  });
});

describe('parseBoardFile — untrusted input', () => {
  // Everything here goes straight into a Yjs document that replicates to every
  // collaborator, so a bad shape has to be dropped rather than repaired.
  it.each([
    ['a missing coordinate', { ...rectangle, x: undefined }],
    ['a coordinate that is a string', { ...rectangle, x: '10' }],
    ['a NaN coordinate', { ...rectangle, y: Number.NaN }],
    ['no width', { ...rectangle, width: undefined }],
    ['an unknown kind', { ...rectangle, kind: 'hexagon' }],
    ['no kind at all', { x: 1, y: 2 }],
    ['a null shape', null],
    ['a string instead of a shape', 'rectangle'],
    ['an arrow with a single point', { kind: 'arrow', x: 0, y: 0, points: [[0, 0]] }],
    ['points that are not pairs', { kind: 'line', x: 0, y: 0, points: [[0], [1]] }],
    ['text that is an object', { kind: 'text', x: 0, y: 0, text: { toString: 'nope' } }],
  ])('drops a shape with %s', (_label, shape) => {
    const { shapes, skipped } = parseBoardFile(boardFile([shape]), genId);
    expect(shapes).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('keeps the good shapes in a file that also has bad ones', () => {
    const { shapes, skipped } = parseBoardFile(
      boardFile([rectangle, { kind: 'hexagon', x: 0, y: 0 }, rectangle]),
      genId,
    );
    expect(shapes).toHaveLength(2);
    expect(skipped).toBe(1);
  });

  it('replaces out-of-range and unknown style values with defaults', () => {
    const { shapes } = parseBoardFile(
      boardFile([{ ...rectangle, opacity: 500, fillStyle: 'plaid', roughness: 9 }]),
      genId,
    );
    expect(shapes[0]?.opacity).toBe(100);
    expect(shapes[0]?.fillStyle).toBe('hachure');
    expect(shapes[0]?.roughness).toBe(1);
  });

  it('keeps a null fillColor, which means "no fill"', () => {
    const { shapes } = parseBoardFile(boardFile([{ ...rectangle, fillColor: null }]), genId);
    expect(shapes[0]?.fillColor).toBeNull();
  });
});

describe('parseBoardFile — Excalidraw files', () => {
  const excalidrawFile = (elements: unknown[], appState?: Record<string, unknown>) =>
    JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'excalidraw.com',
      elements,
      appState,
    });

  it('converts elements through the adapter', () => {
    const { shapes, format } = parseBoardFile(
      excalidrawFile([
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', type: 'text', x: 5, y: 5, text: 'hello', fontSize: 20 },
      ]),
      genId,
    );
    expect(format).toBe('excalidraw');
    expect(shapes).toHaveLength(2);
    const textShape = shapes.find((s: Shape) => isText(s));
    expect(textShape && isText(textShape) ? textShape.text : null).toBe('hello');
  });

  it('counts elements it cannot represent instead of failing the file', () => {
    const { shapes, skipped } = parseBoardFile(
      excalidrawFile([
        { id: 'a', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', type: 'image', x: 0, y: 0, width: 10, height: 10 },
        { id: 'c', type: 'frame', x: 0, y: 0, width: 10, height: 10 },
      ]),
      genId,
    );
    expect(shapes).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it('picks up the view background colour', () => {
    const { canvasBackground } = parseBoardFile(
      excalidrawFile([], { viewBackgroundColor: '#f5faff' }),
      genId,
    );
    expect(canvasBackground).toBe('#f5faff');
  });

  it('substitutes a default arrow when an element has too few points', () => {
    // The adapter is lenient here rather than dropping the element — worth
    // pinning down, since a degenerate arrow arriving as a 100px one is a
    // choice and not an accident.
    const { shapes, skipped } = parseBoardFile(
      excalidrawFile([{ id: 'a', type: 'arrow', x: 0, y: 0, points: [[0, 0]] }]),
      genId,
    );
    expect(shapes).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('sanitizes what the adapter produces, not just our own format', () => {
    // The adapter trusts the fields it reads, so a string coordinate would
    const { shapes, skipped } = parseBoardFile(
      excalidrawFile([
        { id: 'a', type: 'rectangle', x: '5', y: 0, width: 10, height: 10 },
        { id: 'b', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 },
      ]),
      genId,
    );
    expect(shapes).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});
