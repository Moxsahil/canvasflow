import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { hitTest } from '../src/hit-testing/hit-test.js';
import {
  layoutMindMaps,
  looksLikeOutline,
  MAX_OUTLINE_TOPICS,
  mindMapBranches,
  mindMapMermaid,
  mindMapOutline,
  parseOutline,
  topicsFromOutline,
  type OutlineNode,
  mindMapDropAt,
  mindMapFoldBadgeAt,
  mindMapFoldBadges,
  mindMapFlipPatches,
  topicDropPatches,
  mindMapForest,
  newChildTopic,
  newSiblingTopic,
  relinkTopicParents,
  withMindMapBranches,
  withMindMapRoots,
} from '../src/mindmap/index.js';
import { parsePresenceState } from '../src/presence/presence-state.js';
import { renderSceneToSvgString } from '../src/renderers/svg-scene.js';
import { findTextMatches, matchRects, searchableText } from '../src/search/find-text.js';
import { sanitizeShape } from '../src/sanitize/sanitize-shape.js';
import { createRectangle } from '../src/shapes/rectangle.js';
import type { Shape, TopicShape } from '../src/shapes/shape.js';
import { BRANCH_COLORS, createTopic, topicGaps, topicSize } from '../src/shapes/topic.js';
import { hiddenShapeIds } from '../src/shapes/visibility.js';
import { SpatialIndex } from '../src/spatial/spatial-index.js';

function topic(
  id: string,
  parentId: string | null,
  overrides: Partial<Parameters<typeof createTopic>[0]> = {},
): TopicShape {
  return createTopic({ id, x: 0, y: 0, text: id, parentId, seed: 1, ...overrides });
}

function byId(shapes: readonly Shape[]): Map<string, TopicShape> {
  return new Map(shapes.filter((s): s is TopicShape => s.kind === 'topic').map((s) => [s.id, s]));
}

describe('mind map layout', () => {
  it('leaves the centre where it is stored', () => {
    const laid = byId(layoutMindMaps([topic('root', null, { x: 120, y: -40 })]));
    expect(laid.get('root')).toMatchObject({ x: 120, y: -40 });
  });

  it('grows right-hand branches out from the right edge and left-hand ones from the left', () => {
    const root = topic('root', null, { x: 0, y: 0 });
    const laid = byId(
      layoutMindMaps([
        root,
        topic('r', 'root', { side: 'right', x: 999, y: 999 }),
        topic('l', 'root', { side: 'left' }),
      ]),
    );
    const { across } = topicGaps(root);
    const rootSize = topicSize(root);
    const right = laid.get('r')!;
    const left = laid.get('l')!;

    expect(right.x).toBeCloseTo(rootSize.width + across);
    expect(left.x + topicSize(left).width).toBeCloseTo(-across);
    // Each alone on its side, so level with the centre.
    const middle = rootSize.height / 2;
    expect(right.y + topicSize(right).height / 2).toBeCloseTo(middle);
    expect(left.y + topicSize(left).height / 2).toBeCloseTo(middle);
  });

  it('stacks siblings in order without overlapping, centred on their parent', () => {
    const shapes = [
      topic('root', null),
      topic('b', 'root', { order: 2 }),
      topic('a', 'root', { order: 1 }),
      topic('c', 'root', { order: 3 }),
    ];
    const laid = byId(layoutMindMaps(shapes));
    const a = laid.get('a')!;
    const b = laid.get('b')!;
    const c = laid.get('c')!;
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    expect(a.y + topicSize(a).height).toBeLessThanOrEqual(b.y);
    expect(b.y + topicSize(b).height).toBeLessThanOrEqual(c.y);

    const root = laid.get('root')!;
    const middle = root.y + topicSize(root).height / 2;
    const top = a.y;
    const bottom = c.y + topicSize(c).height;
    expect((top + bottom) / 2).toBeCloseTo(middle);
  });

  it('makes room for a branch with more under it', () => {
    const shapes = [
      topic('root', null),
      topic('a', 'root', { order: 1 }),
      topic('b', 'root', { order: 2 }),
      topic('a1', 'a', { order: 1 }),
      topic('a2', 'a', { order: 2 }),
      topic('a3', 'a', { order: 3 }),
    ];
    const laid = byId(layoutMindMaps(shapes));
    const deepest = laid.get('a3')!;
    // Everything under a ends above b's own box.
    expect(deepest.y + topicSize(deepest).height).toBeLessThanOrEqual(laid.get('b')!.y);
  });

  it('carries a branch along with its centre', () => {
    const before = byId(layoutMindMaps([topic('root', null), topic('a', 'root')]));
    const after = byId(layoutMindMaps([topic('root', null, { x: 50, y: 30 }), topic('a', 'root')]));
    expect(after.get('a')!.x - before.get('a')!.x).toBeCloseTo(50);
    expect(after.get('a')!.y - before.get('a')!.y).toBeCloseTo(30);
  });

  it('reads a topic whose parent is gone as a centre of its own', () => {
    const laid = byId(layoutMindMaps([topic('orphan', 'missing', { x: 7, y: 8 })]));
    expect(laid.get('orphan')).toMatchObject({ x: 7, y: 8 });
  });

  it('survives a loop of parents', () => {
    const shapes = [topic('a', 'b', { x: 1, y: 2 }), topic('b', 'a')];
    const forest = mindMapForest(shapes);
    expect(forest.roots.map((r) => r.id)).toEqual(['a']);
    const laid = byId(layoutMindMaps(shapes));
    expect(laid.get('a')).toMatchObject({ x: 1, y: 2 });
    expect(Number.isFinite(laid.get('b')!.x)).toBe(true);
  });

  it('hands back the same objects when there is no map', () => {
    const shapes = [createRectangle({ id: 'r', x: 0, y: 0, width: 10, height: 10 })];
    expect(layoutMindMaps(shapes)).toBe(shapes);
  });
});

describe('mind map branches', () => {
  it('runs each line from the parent edge facing the child to the child near edge', () => {
    const laid = layoutMindMaps([
      topic('root', null),
      topic('r', 'root', { side: 'right' }),
      topic('l', 'root', { side: 'left' }),
    ]);
    const shapes = byId(laid);
    const root = shapes.get('root')!;
    const branches = new Map(mindMapBranches(laid).map((b) => [b.child.id, b]));

    expect(branches.get('r')!.from.x).toBeCloseTo(root.x + topicSize(root).width);
    expect(branches.get('r')!.to.x).toBeCloseTo(shapes.get('r')!.x);
    expect(branches.get('l')!.from.x).toBeCloseTo(root.x);
    const left = shapes.get('l')!;
    expect(branches.get('l')!.to.x).toBeCloseTo(left.x + topicSize(left).width);
  });

  it('draws no line to a parent that was not handed over', () => {
    expect(mindMapBranches([topic('a', 'root')])).toEqual([]);
  });
});

describe('new topics', () => {
  it('opens a new branch off the centre on the emptier side in the next colour', () => {
    let shapes: Shape[] = [topic('root', null)];
    const first = newChildTopic(shapes, 'root', 'c1')!;
    shapes = [...shapes, first];
    const second = newChildTopic(shapes, 'root', 'c2')!;

    expect(first).toMatchObject({ parentId: 'root', side: 'right', text: '' });
    expect(second.side).toBe('left');
    expect(first.strokeColor).toBe(BRANCH_COLORS[0]);
    expect(second.strokeColor).toBe(BRANCH_COLORS[1]);
  });

  it('opens a new branch off the centre on the side asked for', () => {
    const shapes: Shape[] = [topic('root', null), topic('a', 'root', { side: 'right' })];
    expect(newChildTopic(shapes, 'root', 'c', 'right')!.side).toBe('right');
    expect(newChildTopic(shapes, 'a', 'a1', 'left')!.side).toBe('right');
  });

  it('gives a topic grown further out a colour other than the one it grew from', () => {
    const shapes = [
      topic('root', null),
      topic('a', 'root', { side: 'left', strokeColor: '#2f9e44' }),
      topic('a1', 'a', { side: 'left', strokeColor: '#1971c2' }),
    ];
    const child = newChildTopic(shapes, 'a', 'a2')!;
    expect(child).toMatchObject({ side: 'left', parentId: 'a' });
    expect(child.strokeColor).not.toBe('#2f9e44');
    const sibling = newSiblingTopic(shapes, 'a1', 's')!;
    expect(sibling.strokeColor).not.toBe('#1971c2');
  });

  it('puts a sibling between a topic and the next one on its side', () => {
    const shapes = [
      topic('root', null),
      topic('a', 'root', { order: 1 }),
      topic('b', 'root', { order: 2 }),
    ];
    const sibling = newSiblingTopic(shapes, 'a', 's')!;
    expect(sibling.parentId).toBe('root');
    expect(sibling.order).toBeGreaterThan(1);
    expect(sibling.order).toBeLessThan(2);
  });

  it('gives the centre a child when asked for a sibling', () => {
    const sibling = newSiblingTopic([topic('root', null)], 'root', 's')!;
    expect(sibling.parentId).toBe('root');
  });
});

describe('mind map selections', () => {
  const shapes = [
    topic('root', null),
    topic('a', 'root'),
    topic('a1', 'a'),
    topic('b', 'root'),
    createRectangle({ id: 'box', x: 0, y: 0, width: 10, height: 10 }),
  ];

  it('takes a topic with everything further out along its branch', () => {
    expect(withMindMapBranches(['a'], shapes).sort()).toEqual(['a', 'a1']);
    expect(withMindMapBranches(['root'], shapes).sort()).toEqual(['a', 'a1', 'b', 'root']);
  });

  it('swaps topics for the centre of their map and leaves other shapes be', () => {
    expect(withMindMapRoots(['a1', 'box', 'b'], shapes).sort()).toEqual(['box', 'root']);
  });

  it('relinks pasted topics and frees those whose parent stayed behind', () => {
    const relinked = byId(
      relinkTopicParents(
        [topic('new-a', 'a'), topic('new-a1', 'a1')],
        new Map([
          ['a1', 'x'],
          ['a', 'new-a'],
        ]),
      ),
    );
    expect(relinked.get('new-a')!.parentId).toBe('new-a');
    const freed = byId(relinkTopicParents([topic('t', 'gone')], new Map()));
    expect(freed.get('t')!.parentId).toBeNull();
  });
});

describe('topics on the board', () => {
  it('round-trips through the document', () => {
    const original = topic('t', 'p', { side: 'left', order: 2.5, text: 'Hello\nworld' });
    const doc = new Y.Doc();
    doc.getArray<Y.Map<unknown>>('shapes').push([shapeToYMap(original)]);
    const read = yMapToShape(doc.getArray<Y.Map<unknown>>('shapes').get(0));
    expect(read).toMatchObject({
      kind: 'topic',
      text: 'Hello\nworld',
      parentId: 'p',
      side: 'left',
      order: 2.5,
    });
  });

  it('is laid out on every read of the board', () => {
    const doc = new BoardDocument();
    doc.addShape(topic('root', null, { x: 100, y: 100 }));
    doc.addShape(topic('a', 'root', { x: -5000, y: -5000 }));
    const a = doc.getShapes().find((s) => s.id === 'a')!;
    expect(a.x).toBeGreaterThan(100);
  });

  it('duplicates a branch on its own into the same map', () => {
    const doc = new BoardDocument();
    doc.addShape(topic('root', null));
    doc.addShape(topic('a', 'root'));
    doc.addShape(topic('a1', 'a'));
    let n = 0;
    const [copyA, copyA1] = doc.duplicateShapes(['a', 'a1'], { dx: 10, dy: 10 }, () => `c${n++}`);
    const copies = byId(doc.getShapes());
    expect(copies.get(copyA!)!.parentId).toBe('root');
    expect(copies.get(copyA1!)!.parentId).toBe(copyA);
  });

  it('is hit anywhere inside its box', () => {
    const laid = layoutMindMaps([topic('root', null, { x: 0, y: 0 })]);
    const index = new SpatialIndex();
    index.rebuild(laid);
    const { width, height } = topicSize(laid[0] as TopicShape);
    expect(hitTest(laid, index, width / 2, height / 2, 1)?.id).toBe('root');
  });

  it('comes through a board file with its parent named as it was', () => {
    const shape = sanitizeShape(topic('t', 'p'), () => 'fresh');
    expect(shape).toMatchObject({ kind: 'topic', id: 'fresh', parentId: 'p' });
  });

  it('exports its box, its words and its branch lines', () => {
    const svg = renderSceneToSvgString(
      layoutMindMaps([topic('root', null, { text: 'Plan' }), topic('a', 'root', { text: 'Do' })]),
    );
    expect(svg).toContain('>Plan</text>');
    expect(svg).toContain('>Do</text>');
    expect(svg).toMatch(/<path d="M [^"]+ C /);
  });
});

describe('folded topics', () => {
  const shapes = [
    topic('root', null),
    topic('a', 'root', { order: 1, collapsed: true }),
    topic('a1', 'a'),
    topic('a2', 'a'),
    topic('a1x', 'a1'),
    topic('b', 'root', { order: 2 }),
  ];

  it('hides everything further out along a folded topic, and nothing else', () => {
    expect([...hiddenShapeIds(shapes)].sort()).toEqual(['a1', 'a1x', 'a2']);
  });

  it('gives the folded branch no room in the map', () => {
    const open = byId(layoutMindMaps(shapes.map((s) => ({ ...s, collapsed: false }) as Shape)));
    const folded = byId(layoutMindMaps(shapes));
    const gapOpen = open.get('b')!.y - open.get('a')!.y;
    const gapFolded = folded.get('b')!.y - folded.get('a')!.y;
    expect(gapFolded).toBeLessThan(gapOpen);
    expect(folded.get('a1x')).toMatchObject({ x: folded.get('a')!.x, y: folded.get('a')!.y });
  });

  it('counts what is folded on a badge that can be pressed', () => {
    const laid = layoutMindMaps(shapes);
    const [badge] = mindMapFoldBadges(laid);
    expect(badge).toMatchObject({ count: 3 });
    expect(badge!.topic.id).toBe('a');
    expect(mindMapFoldBadgeAt(laid, badge!.centre)).toBe('a');
    expect(mindMapFoldBadgeAt(laid, { x: -9999, y: -9999 })).toBeNull();
  });

  it('round-trips the fold', () => {
    const doc = new Y.Doc();
    doc
      .getArray<Y.Map<unknown>>('shapes')
      .push([shapeToYMap(topic('t', null, { collapsed: true }))]);
    expect(yMapToShape(doc.getArray<Y.Map<unknown>>('shapes').get(0))).toMatchObject({
      collapsed: true,
    });
  });
});

describe('dragging a topic', () => {
  const laid = layoutMindMaps([
    topic('root', null),
    topic('a', 'root', { order: 1 }),
    topic('b', 'root', { order: 2 }),
    topic('c', 'root', { order: 3 }),
    topic('b1', 'b'),
  ]);
  const at = byId(laid);
  const middle = (id: string) => {
    const t = at.get(id)!;
    const { width, height } = topicSize(t);
    return { x: t.x + width / 2, y: t.y + height / 2 };
  };

  it('hangs it under the topic it is dropped on', () => {
    expect(mindMapDropAt(laid, 'c', middle('a'))).toMatchObject({ parentId: 'a', order: 0 });
  });

  it('puts it above or below the topic it is dropped beside', () => {
    const a = at.get('a')!;
    const aHeight = topicSize(a).height;
    const above = mindMapDropAt(laid, 'c', { x: a.x - 4, y: a.y + aHeight * 0.25 })!;
    expect(above.parentId).toBe('root');
    expect(above.order).toBeLessThan(1);
    const below = mindMapDropAt(laid, 'c', { x: a.x - 4, y: a.y + aHeight * 0.75 })!;
    expect(below.order).toBeGreaterThan(1);
    expect(below.order).toBeLessThan(2);
  });

  it('moves it across the centre to a side with nothing on it', () => {
    const root = at.get('root')!;
    const drop = mindMapDropAt(laid, 'c', { x: root.x - 80, y: middle('root').y });
    expect(drop).toMatchObject({ parentId: 'root', side: 'left' });
  });

  it('never drops a topic into its own branch, and leaves the centre where it is', () => {
    expect(mindMapDropAt(laid, 'b', middle('b1'))).toBeNull();
    expect(mindMapDropAt(laid, 'root', middle('a'))).toBeNull();
    expect(mindMapDropAt(laid, 'c', { x: -9999, y: -9999 })).toBeNull();
  });

  it('carries the new side along the whole branch', () => {
    const patches = topicDropPatches(laid, 'b', { parentId: 'root', side: 'left', order: 9 });
    expect(patches).toEqual([
      { id: 'b', patch: { parentId: 'root', side: 'left', order: 9 } },
      { id: 'b1', patch: { side: 'left' } },
    ]);
  });
});

describe('flipping a map', () => {
  const shapes = [
    topic('root', null),
    topic('a', 'root', { side: 'right', order: 1 }),
    topic('b', 'root', { side: 'right', order: 2 }),
    topic('l', 'root', { side: 'left', order: 3 }),
    topic('a1', 'a', { side: 'right', order: 1 }),
    topic('a2', 'a', { side: 'right', order: 2 }),
  ];
  const patchFor = (patches: ReturnType<typeof mindMapFlipPatches>, id: string) =>
    patches.find((p) => p.id === id)?.patch;

  it('swaps every branch to the other side across a centre', () => {
    const patches = mindMapFlipPatches(shapes, ['root'], 'horizontal');
    expect(patchFor(patches, 'a')).toEqual({ side: 'left' });
    expect(patchFor(patches, 'a1')).toEqual({ side: 'left' });
    expect(patchFor(patches, 'l')).toEqual({ side: 'right' });
    expect(patchFor(patches, 'root')).toBeUndefined();
  });

  it('moves the whole branch a deeper topic is on across', () => {
    const patches = mindMapFlipPatches(shapes, ['a2'], 'horizontal');
    expect(patches.map((p) => p.id).sort()).toEqual(['a', 'a1', 'a2']);
  });

  it('turns the stacks under a topic upside down, at every depth', () => {
    const flipped = byId(
      layoutMindMaps(
        shapes.map((s) => {
          const patch = patchFor(mindMapFlipPatches(shapes, ['root'], 'vertical'), s.id);
          return patch ? ({ ...s, ...patch } as Shape) : s;
        }),
      ),
    );
    expect(flipped.get('b')!.y).toBeLessThan(flipped.get('a')!.y);
    expect(flipped.get('a2')!.y).toBeLessThan(flipped.get('a1')!.y);
  });
});

describe('searching topics', () => {
  it('finds words inside a topic and outlines them inside its box', () => {
    const laid = layoutMindMaps([topic('root', null, { text: 'Launch plan' })]);
    const { matches } = findTextMatches(laid, 'plan');
    expect(matches).toEqual([{ shapeId: 'root', index: 7, length: 4 }]);
    const asText = searchableText(laid[0]!)!;
    const box = topicSize(laid[0] as TopicShape);
    const [rect] = matchRects(asText, 7, 4);
    expect(rect!.x).toBeGreaterThan(0);
    expect(rect!.x + rect!.width).toBeLessThan(box.width);
  });
});

describe('typing seen by everyone', () => {
  const base = { user: { id: 'u1', name: 'A' }, selection: [], activity: 'active' };

  it('carries the shape being typed into and the words so far', () => {
    expect(parsePresenceState({ ...base, typing: { shapeId: 't1', text: 'Hel' } })?.typing).toEqual(
      { shapeId: 't1', text: 'Hel' },
    );
  });

  it('drops typing that is not a shape id and words', () => {
    expect(parsePresenceState({ ...base, typing: { shapeId: 7, text: 'x' } })?.typing).toBeNull();
    expect(parsePresenceState({ ...base, typing: { shapeId: 't', text: {} } })?.typing).toBeNull();
    expect(parsePresenceState(base)?.typing).toBeNull();
  });
});

describe('map layouts', () => {
  const map = (mapLayout: 'both' | 'right' | 'left' | 'down') => [
    topic('root', null, { mapLayout }),
    topic('a', 'root', { side: 'right', order: 1 }),
    topic('b', 'root', { side: 'left', order: 2 }),
    topic('a1', 'a', { side: 'right', order: 1 }),
  ];

  it('puts every branch on the one side of a map that grows one way', () => {
    const right = byId(layoutMindMaps(map('right')));
    const root = right.get('root')!;
    expect(right.get('a')!.x).toBeGreaterThan(root.x);
    expect(right.get('b')!.x).toBeGreaterThan(root.x);
    const left = byId(layoutMindMaps(map('left')));
    expect(left.get('a')!.x).toBeLessThan(left.get('root')!.x);
    expect(left.get('a1')!.x).toBeLessThan(left.get('a')!.x);
  });

  it('hangs a map down from its centre, children in a row under their parent', () => {
    const down = byId(layoutMindMaps(map('down')));
    const root = down.get('root')!;
    const a = down.get('a')!;
    const b = down.get('b')!;
    expect(a.y).toBeGreaterThan(root.y + topicSize(root).height);
    expect(a.y).toBe(b.y);
    expect(a.x + topicSize(a).width).toBeLessThanOrEqual(b.x);
    expect(down.get('a1')!.y).toBeGreaterThan(a.y + topicSize(a).height);
    const branch = mindMapBranches([...down.values()]).find((x) => x.child.id === 'a')!;
    expect(branch.vertical).toBe(true);
    expect(branch.from.y).toBeCloseTo(root.y + topicSize(root).height);
    expect(branch.to.y).toBeCloseTo(a.y);
  });

  it('keeps each branch its side, so a map turned back to both ways is as it was', () => {
    const both = byId(layoutMindMaps(map('both')));
    expect(both.get('b')!.x).toBeLessThan(both.get('root')!.x);
  });

  it('drops beside a topic in a row of a map hung down', () => {
    const laid = layoutMindMaps([...map('down'), topic('c', 'root', { order: 3 })]);
    const at = byId(laid);
    const a = at.get('a')!;
    const { width, height } = topicSize(a);
    const drop = mindMapDropAt(laid, 'c', { x: a.x + width * 0.2, y: a.y + height + 6 })!;
    expect(drop.parentId).toBe('root');
    expect(drop.order).toBeLessThan(1);
  });

  it('flips a one-sided map to the other side, and turns a hung map’s rows over', () => {
    const across = mindMapFlipPatches(map('right'), ['a1'], 'horizontal');
    expect(across).toEqual([{ id: 'root', patch: { mapLayout: 'left' } }]);
    const rows = mindMapFlipPatches(map('down'), ['root'], 'horizontal');
    expect(rows.find((p) => p.id === 'a')!.patch).toEqual({ order: -1 });
    expect(mindMapFlipPatches(map('down'), ['root'], 'vertical')).toEqual([]);
  });

  it('round-trips the layout, the lines and the outline, and reads nonsense as the default', () => {
    const doc = new Y.Doc();
    const shapes = doc.getArray<Y.Map<unknown>>('shapes');
    shapes.push([
      shapeToYMap(topic('t', null, { mapLayout: 'down', mapLines: 'elbow', topicShape: 'pill' })),
    ]);
    expect(yMapToShape(shapes.get(0))).toMatchObject({
      mapLayout: 'down',
      mapLines: 'elbow',
      topicShape: 'pill',
    });
    shapes.get(0).set('mapLayout', 'sideways');
    expect(yMapToShape(shapes.get(0))).toMatchObject({ mapLayout: 'both' });
  });
});

describe('lines and outlines', () => {
  it('draws straight and elbow lines without curves', () => {
    for (const mapLines of ['straight', 'elbow'] as const) {
      const svg = renderSceneToSvgString(
        layoutMindMaps([topic('root', null, { mapLines }), topic('a', 'root')]),
      );
      expect(svg).toMatch(/<path d="M [^"C]+"/);
      expect(svg).not.toMatch(/<path d="M [^"]+ C /);
    }
  });

  it('draws an underlined topic as a rule under its words, with no box', () => {
    const svg = renderSceneToSvgString([topic('t', null, { topicShape: 'underline' })]);
    expect(svg).toContain('stroke="none"');
    expect(svg).toMatch(/<path d="M [^"]+ H /);
  });

  it('carries a topic’s outline on to the topics grown from it', () => {
    const shapes = [topic('root', null, { topicShape: 'pill' })];
    expect(newChildTopic(shapes, 'root', 'c')!.topicShape).toBe('pill');
  });
});

describe('outlines in and out', () => {
  const tree = (nodes: readonly OutlineNode[]): unknown =>
    nodes.map((n) => (n.children.length ? { [n.text]: tree(n.children) } : n.text));

  it('nests indented lines, with spaces or tabs, under the line above', () => {
    const outline = parseOutline(
      'Launch plan\n  Marketing\n    Ads\n    SEO\n  Pricing\n  Website',
    )!;
    expect(tree(outline)).toEqual([
      { 'Launch plan': [{ Marketing: ['Ads', 'SEO'] }, 'Pricing', 'Website'] },
    ]);
  });

  it('reads tabs as indentation too', () => {
    expect(tree(parseOutline('Plan\n\tA\n\t\tA1\n\tB')!)).toEqual([{ Plan: [{ A: ['A1'] }, 'B'] }]);
  });

  it('drops bullets, numbers and checkboxes, keeping the words', () => {
    const outline = parseOutline('- Plan\n  * [ ] Ads\n  2. SEO\n  • [x] Done')!;
    expect(tree(outline)).toEqual([{ Plan: ['Ads', 'SEO', 'Done'] }]);
  });

  it('hangs what follows a Markdown heading under it, a ## under a #', () => {
    const outline = parseOutline('# Trip\n## Flights\n- Out\n- Back\n## Hotels')!;
    expect(tree(outline)).toEqual([{ Trip: [{ Flights: ['Out', 'Back'] }, 'Hotels'] }]);
  });

  it('reads a Mermaid mind map, node shapes and all', () => {
    const outline = parseOutline(
      'mindmap\n  root((Launch))\n    a[Marketing]\n      Ads\n    b("Pricing")\n    ::icon(fa fa-book)',
    )!;
    expect(tree(outline)).toEqual([{ Launch: [{ Marketing: ['Ads'] }, 'Pricing'] }]);
  });

  it('tells a list from a sentence', () => {
    expect(looksLikeOutline('Plan\n  Ads')).toBe(true);
    expect(looksLikeOutline('- one\n- two')).toBe(true);
    expect(looksLikeOutline('just one line')).toBe(false);
    expect(looksLikeOutline('two lines\nof plain prose')).toBe(false);
  });

  it('grows an outline under a topic, colours and all', () => {
    const board = [topic('root', null)];
    let n = 0;
    const made = topicsFromOutline(board, 'root', parseOutline('A\n  A1\nB')!, () => `n${n++}`);
    expect(made.map((t) => [t.text, t.parentId])).toEqual([
      ['A', 'root'],
      ['A1', 'n0'],
      ['B', 'root'],
    ]);
    expect(made[0]!.strokeColor).not.toBe(made[2]!.strokeColor);
  });

  it('stops at the most topics one paste makes', () => {
    const many = Array.from({ length: MAX_OUTLINE_TOPICS + 50 }, (_, i) => `item ${i}`).join('\n');
    expect(parseOutline(many)!.length).toBe(MAX_OUTLINE_TOPICS);
  });

  const map = [
    topic('root', null, { text: 'Launch', y: 0 }),
    topic('a', 'root', { text: 'Marketing', order: 1 }),
    topic('a1', 'a', { text: 'Ads (paid)' }),
    topic('b', 'root', { text: 'Pricing', order: 2 }),
  ];

  it('copies a map as an indented list that pastes back as the same map', () => {
    const text = mindMapOutline(map);
    expect(text).toBe('Launch\n  Marketing\n    Ads (paid)\n  Pricing');
    expect(tree(parseOutline(text)!)).toEqual([
      { Launch: [{ Marketing: ['Ads (paid)'] }, 'Pricing'] },
    ]);
  });

  it('copies a map as Mermaid that reads back as the same map', () => {
    const chart = mindMapMermaid(map);
    expect(chart.split('\n')[0]).toBe('mindmap');
    expect(chart).toContain('root(("`Launch`"))');
    expect(tree(parseOutline(chart)!)).toEqual([
      { Launch: [{ Marketing: ['Ads (paid)'] }, 'Pricing'] },
    ]);
  });
});
