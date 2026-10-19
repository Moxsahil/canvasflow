import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { boardScene } from './board-scene.js';

const HASH = 'a'.repeat(64);

function shape(fields: Record<string, unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(fields)) map.set(key, value);
  return map;
}

function boardWith(
  shapes: Record<string, unknown>[],
  comment = 'Our launch date is secret',
): Uint8Array {
  const doc = new Y.Doc();
  doc.getArray('shapes').push(shapes.map(shape));
  const thread = new Y.Map<unknown>();
  thread.set('body', comment);
  doc.getMap('comments').set('t1', thread);
  return Y.encodeStateAsUpdate(doc);
}

describe('boardScene', () => {
  it('is empty for a board never drawn on', () => {
    expect(boardScene([]).shapes).toEqual([]);
  });

  it('carries the drawing and leaves the comments and who drew it behind', () => {
    const scene = boardScene([
      boardWith([
        { id: 'r', kind: 'rectangle', x: 1, y: 2, lastEditedBy: 'user-1', lastEditedAt: 5 },
      ]),
    ]);
    expect(scene.shapes).toEqual([{ id: 'r', kind: 'rectangle', x: 1, y: 2 }]);
    expect(JSON.stringify(scene)).not.toContain('secret');
  });

  it('leaves out what is hidden, and everything standing in a hidden frame', () => {
    const scene = boardScene([
      boardWith([
        { id: 'f', kind: 'frame', hidden: true },
        { id: 'inner', kind: 'frame', frameId: 'f' },
        { id: 'deep', kind: 'rectangle', frameId: 'inner' },
        { id: 'h', kind: 'ellipse', hidden: true },
        { id: 'shown', kind: 'ellipse', frameId: 'missing' },
      ]),
    ]);
    expect(scene.shapes.map((s) => s.id)).toEqual(['shown']);
  });

  it('survives frames that stand in each other', () => {
    const scene = boardScene([
      boardWith([
        { id: 'a', kind: 'frame', frameId: 'b' },
        { id: 'b', kind: 'frame', frameId: 'a' },
      ]),
    ]);
    expect(scene.shapes.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('names only the pictures that are drawn, and only well-formed ones', () => {
    const scene = boardScene([
      boardWith([
        { id: 'i', kind: 'image', fileId: HASH },
        { id: 'gone', kind: 'image', fileId: 'b'.repeat(64), hidden: true },
        { id: 'bad', kind: 'image', fileId: '../other-board/x' },
        { id: 'card', kind: 'bookmark', image: `${HASH}.jpg` },
        { id: 'video', kind: 'embed', poster: `${'c'.repeat(64)}.png` },
        { id: 'odd', kind: 'bookmark', image: 'https://elsewhere.example/x.png' },
      ]),
    ]);
    expect([...scene.imageIds]).toEqual([HASH]);
    expect([...scene.previewNames]).toEqual([`${HASH}.jpg`, `${'c'.repeat(64)}.png`]);
  });
});
