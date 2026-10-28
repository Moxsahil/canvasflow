import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import {
  buildDiagram,
  buildDiagramWithElk,
  collectDiagram,
  parseDiagramLine,
} from '../src/diagram/index.js';
import { layoutDiagram } from '../src/diagram/layout.js';
import { layoutDiagramWithElk, type ElkLike } from '../src/diagram/layout-elk.js';
import { diagramToShapes } from '../src/diagram/to-shapes.js';
import type { DiagramIR } from '../src/diagram/ir.js';
import type { ArrowShape, ImageShape, NoteShape, Shape, TextShape } from '../src/shapes/shape.js';
import { shapeBounds } from '../src/shapes/bounds.js';
import { boundArrowPatches } from '../src/shapes/arrow-binding.js';

const elk = new ELK() as unknown as ElkLike;

const counter = () => {
  let n = 0;
  return () => `id-${n++}`;
};

const node = (id: string, text = id, kind = 'rectangle') =>
  JSON.stringify({ t: 'node', id, kind, text });
const edge = (from: string, to: string, label?: string) =>
  JSON.stringify({ t: 'edge', from, to, ...(label === undefined ? {} : { label }) });

const overlaps = (a: Shape, b: Shape) => {
  const x = shapeBounds(a);
  const y = shapeBounds(b);
  return x.x < y.x + y.width && x.x + x.width > y.x && x.y < y.y + y.height && x.y + x.height > y.y;
};

describe('parseDiagramLine', () => {
  it('treats a half-written line as neither valid nor an error', () => {
    for (const partial of ['{"t":"node","id":"a"', '{', '  ', '{"t":"nod']) {
      const result = parseDiagramLine(partial);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toBeNull();
    }
  });

  it('reads a node', () => {
    const result = parseDiagramLine(node('api', 'API Server'));
    expect(result).toEqual({
      ok: true,
      value: { t: 'node', id: 'api', kind: 'rectangle', text: 'API Server' },
    });
  });

  it('defaults an absent edge label to empty rather than rejecting', () => {
    const result = parseDiagramLine(edge('a', 'b'));
    expect(result.ok && result.value).toEqual({ t: 'edge', from: 'a', to: 'b', label: '' });
  });

  it('names the offending value when a kind is unknown', () => {
    const result = parseDiagramLine(
      JSON.stringify({ t: 'node', id: 'a', kind: 'hexagon', text: 'A' }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error?.reason).toContain('hexagon');
    expect(result.ok === false && result.error?.reason).toContain('rectangle');
  });

  it('rejects a node with no text, a self-edge, and an unknown element type', () => {
    const noText = parseDiagramLine(
      JSON.stringify({ t: 'node', id: 'a', kind: 'ellipse', text: '  ' }),
    );
    expect(noText.ok === false && noText.error?.reason).toContain('text');

    const selfEdge = parseDiagramLine(edge('a', 'a'));
    expect(selfEdge.ok === false && selfEdge.error?.reason).toContain('itself');

    const unknown = parseDiagramLine(JSON.stringify({ t: 'cluster', id: 'a' }));
    expect(unknown.ok === false && unknown.error?.reason).toContain('cluster');
  });
});

describe('collectDiagram', () => {
  it('drops an edge naming a node that never arrived, and says which', () => {
    const { diagram, errors } = collectDiagram([node('a'), edge('a', 'ghost')]);
    expect(diagram.edges).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.reason).toContain('ghost');
  });

  it('accepts an edge that arrives before the node it names', () => {
    const { diagram, errors } = collectDiagram([edge('a', 'b'), node('a'), node('b')]);
    expect(errors).toHaveLength(0);
    expect(diagram.edges).toHaveLength(1);
  });

  it('keeps one arrow when the same edge is repeated', () => {
    const { diagram } = collectDiagram([node('a'), node('b'), edge('a', 'b'), edge('a', 'b')]);
    expect(diagram.edges).toHaveLength(1);
  });

  it('records a duplicate node id instead of drawing it twice', () => {
    const { diagram, errors } = collectDiagram([node('a'), node('a', 'again')]);
    expect(diagram.nodes).toHaveLength(1);
    expect(errors[0]!.reason).toContain('Duplicate');
  });

  it('reads direction from meta', () => {
    const { diagram } = collectDiagram([JSON.stringify({ t: 'meta', direction: 'LR' }), node('a')]);
    expect(diagram.direction).toBe('LR');
  });
});

describe('layoutDiagram', () => {
  const chain = () =>
    collectDiagram([node('a'), node('b'), node('c'), edge('a', 'b'), edge('b', 'c')]).diagram;

  it('puts every node below the one that points at it', () => {
    const { nodes } = layoutDiagram(chain());
    const y = (id: string) => nodes.find((n) => n.id === id)!.y;
    expect(y('a')).toBeLessThan(y('b'));
    expect(y('b')).toBeLessThan(y('c'));
  });

  it('runs left to right when asked, without moving anything vertically apart', () => {
    const { nodes } = layoutDiagram({ ...chain(), direction: 'LR' });
    const x = (id: string) => nodes.find((n) => n.id === id)!.x;
    const y = (id: string) => nodes.find((n) => n.id === id)!.y;
    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
    expect(y('b')).toBe(y('a'));
    expect(y('c')).toBe(y('a'));
  });

  const expectNoOverlaps = (diagram: DiagramIR) => {
    const { nodes } = layoutDiagram(diagram);
    const shapes = diagramToShapes({ nodes, edges: [], groups: [], texts: [] }, counter());
    const boxes = shapes.filter((s) => s.kind !== 'text');

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i]!, boxes[j]!), `${i} overlaps ${j}`).toBe(false);
      }
    }
  };

  const fanOut = () => {
    const lines = [
      node('root', 'Where every request starts'),
      ...Array.from({ length: 6 }, (_, i) => node(`leaf${i}`, `Leaf number ${i} of the fan`)),
    ];
    for (let i = 0; i < 6; i++) lines.push(edge('root', `leaf${i}`));
    return collectDiagram(lines).diagram;
  };

  it('never overlaps two boxes, including a wide fan-out', () => {
    expectNoOverlaps(fanOut());
  });

  // Boxes are wider than they are tall, so running sideways is where spacing by
  // the wrong side would show.
  it('never overlaps two boxes when running left to right', () => {
    expectNoOverlaps({ ...fanOut(), direction: 'LR' });

    const wideChain = collectDiagram([
      node('a', 'A first step with a long name'),
      node('b', 'A second step with a long name'),
      node('c', 'A third step with a long name'),
      edge('a', 'b'),
      edge('b', 'c'),
    ]).diagram;
    expectNoOverlaps({ ...wideChain, direction: 'LR' });
  });

  it('terminates on a cycle', () => {
    const { diagram } = collectDiagram([
      node('a'),
      node('b'),
      node('c'),
      edge('a', 'b'),
      edge('b', 'c'),
      edge('c', 'a'),
    ]);
    const { nodes, edges } = layoutDiagram(diagram);
    expect(nodes).toHaveLength(3);
    // The edge that closes the loop is ignored for ranking but still drawn.
    expect(edges).toHaveLength(3);
  });

  it('starts at the origin', () => {
    const { nodes } = layoutDiagram(chain());
    expect(Math.min(...nodes.map((n) => n.x))).toBe(0);
    expect(Math.min(...nodes.map((n) => n.y))).toBe(0);
  });

  it('wraps a long label instead of drawing one very wide box', () => {
    const { diagram } = collectDiagram([
      node('a', 'A label long enough that it has to be broken across several lines'),
    ]);
    const { nodes } = layoutDiagram(diagram);
    expect(nodes[0]!.label).toContain('\n');
    expect(nodes[0]!.width).toBeLessThan(400);
  });

  it('places an orphan node rather than dropping it', () => {
    const { diagram } = collectDiagram([node('a'), node('b'), edge('a', 'b'), node('loner')]);
    const { nodes } = layoutDiagram(diagram);
    expect(nodes.map((n) => n.id)).toContain('loner');
  });
});

describe('diagramToShapes', () => {
  const build = () =>
    buildDiagram(
      [node('a', 'Start'), node('b', 'End', 'diamond'), edge('a', 'b', 'yes')],
      counter(),
    );

  it('makes a box and a caption for each node, and an arrow for each edge', () => {
    const { shapes } = build();
    expect(shapes.filter((s) => s.kind === 'rectangle')).toHaveLength(1);
    expect(shapes.filter((s) => s.kind === 'diamond')).toHaveLength(1);
    expect(shapes.filter((s) => s.kind === 'text')).toHaveLength(2);
    expect(shapes.filter((s) => s.kind === 'arrow')).toHaveLength(1);
  });

  it('binds both ends of an arrow to the boxes it runs between', () => {
    const { shapes } = build();
    const arrow = shapes.find((s): s is ArrowShape => s.kind === 'arrow')!;
    const boxIds = new Set(
      shapes.filter((s) => s.kind !== 'text' && s.kind !== 'arrow').map((s) => s.id),
    );

    expect(arrow.startBinding).not.toBeNull();
    expect(arrow.endBinding).not.toBeNull();
    expect(boxIds.has(arrow.startBinding!.shapeId)).toBe(true);
    expect(boxIds.has(arrow.endBinding!.shapeId)).toBe(true);
    // Imprecise, so the arrow re-aims itself when either box is dragged.
    expect(arrow.startBinding!.precise).toBe(false);
  });

  it('carries an edge label on the arrow itself', () => {
    const { shapes } = build();
    const arrow = shapes.find((s): s is ArrowShape => s.kind === 'arrow')!;
    expect(arrow.label).toBe('yes');
  });

  it('stores terminals that already sit outside both boxes', () => {
    const { shapes } = build();
    const arrow = shapes.find((s): s is ArrowShape => s.kind === 'arrow')!;
    // A diamond's rounded tip sits inside its box, so only the rectangle's
    // box is the outline here.
    const boxes = shapes.filter((s) => s.kind === 'rectangle');

    const ends = arrow.points.map(([px, py]) => ({ x: arrow.x + px, y: arrow.y + py }));
    for (const box of boxes) {
      const b = shapeBounds(box);
      for (const end of ends) {
        const inside =
          end.x > b.x && end.x < b.x + b.width && end.y > b.y && end.y < b.y + b.height;
        expect(inside).toBe(false);
      }
    }
  });

  it('centres each caption on its box', () => {
    const { shapes } = build();
    const box = shapes.find((s) => s.kind === 'rectangle')!;
    const caption = shapes.find((s): s is TextShape => s.kind === 'text' && s.text === 'Start')!;

    expect(caption.textAlign).toBe('center');
    expect(caption.x).toBeCloseTo(box.x + shapeBounds(box).width / 2, 5);
  });

  it('is deterministic — the same lines give the same board', () => {
    const lines = [node('a', 'Start'), node('b', 'End'), edge('a', 'b')];
    const first = buildDiagram(lines, counter()).shapes;
    const second = buildDiagram(lines, counter()).shapes;
    expect(first).toEqual(second);
  });
});

describe('buildDiagram', () => {
  it('draws what it can and reports what it could not', () => {
    const { shapes, errors } = buildDiagram(
      [
        node('a', 'Good'),
        JSON.stringify({ t: 'node', id: 'b', kind: 'octagon', text: 'Bad' }),
        edge('a', 'b'),
      ],
      counter(),
    );

    expect(shapes.filter((s) => s.kind === 'rectangle')).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.reason).join(' ')).toContain('octagon');
  });

  it('returns nothing for no lines', () => {
    expect(buildDiagram([], counter())).toEqual({ shapes: [], errors: [] });
  });

  it('puts a note node down as a sticky note carrying its own words', () => {
    const { shapes, errors } = buildDiagram(
      [
        JSON.stringify({ t: 'group', id: 'went', label: 'Went well', color: 'green' }),
        JSON.stringify({
          t: 'node',
          id: 'a',
          kind: 'note',
          text: 'Shipped on time',
          group: 'went',
        }),
        JSON.stringify({ t: 'node', id: 'b', kind: 'note', text: 'Ask for help sooner' }),
        edge('a', 'b'),
      ],
      counter(),
    );

    expect(errors).toEqual([]);
    const notes = shapes.filter((s): s is NoteShape => s.kind === 'note');
    expect(notes.map((n) => n.text)).toEqual(['Shipped on time', 'Ask for help sooner']);
    // Green paper from its group, the yellow of a note left uncoloured.
    expect(notes.map((n) => n.fillColor)).toEqual(['#b2f2bb', '#ffec99']);
    expect(notes.every((n) => n.width === 200 && n.height === 200)).toBe(true);
    // No separate label laid over a note.
    expect(shapes.filter((s) => s.kind === 'text').map((s) => (s as TextShape).text)).toEqual([
      'Went well',
    ]);
    const arrow = shapes.find((s): s is ArrowShape => s.kind === 'arrow');
    expect([arrow?.startBinding?.shapeId, arrow?.endBinding?.shapeId]).toEqual(
      notes.map((n) => n.id),
    );
  });
});

const line = (value: Record<string, unknown>) => JSON.stringify(value);

describe('the richer format', () => {
  it('reads groups, texts, icons, colours and how an edge is drawn', () => {
    expect(parseDiagramLine(line({ t: 'group', id: 'api', label: 'API', color: 'blue' }))).toEqual({
      ok: true,
      value: { t: 'group', id: 'api', label: 'API', color: 'blue' },
    });
    expect(
      parseDiagramLine(
        line({
          t: 'node',
          id: 'db',
          kind: 'rectangle',
          text: 'Users',
          group: 'api',
          icon: 'database',
          color: 'green',
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        t: 'node',
        id: 'db',
        kind: 'rectangle',
        text: 'Users',
        group: 'api',
        icon: 'database',
        color: 'green',
      },
    });
    expect(
      parseDiagramLine(line({ t: 'edge', from: 'a', to: 'b', dir: 'both', style: 'dashed' })),
    ).toEqual({
      ok: true,
      value: { t: 'edge', from: 'a', to: 'b', label: '', dir: 'both', style: 'dashed' },
    });
    expect(
      parseDiagramLine(
        line({ t: 'text', id: 'title', text: 'Netflix', size: 'title', color: 'red' }),
      ),
    ).toEqual({
      ok: true,
      value: { t: 'text', id: 'title', text: 'Netflix', size: 'title', color: 'red' },
    });
  });

  it('drops an icon or colour it has no drawing for, and keeps the box', () => {
    const result = parseDiagramLine(
      line({
        t: 'node',
        id: 'a',
        kind: 'rectangle',
        text: 'A',
        icon: 'no-such-icon',
        color: 'mauve',
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: { t: 'node', id: 'a', kind: 'rectangle', text: 'A' },
    });
  });

  it('draws an icon node with no usable icon as a box', () => {
    const result = parseDiagramLine(line({ t: 'node', id: 'a', kind: 'icon', text: 'A' }));
    expect(result.ok && result.value.t === 'node' && result.value.kind).toBe('rectangle');
  });

  it('leaves a node loose when its group never arrives, and drops empty groups', () => {
    const { diagram } = collectDiagram([
      line({ t: 'group', id: 'empty', label: 'Nothing here' }),
      line({ t: 'node', id: 'a', kind: 'rectangle', text: 'A', group: 'missing' }),
      line({ t: 'node', id: 'b', kind: 'rectangle', text: 'B', group: 'late' }),
      line({ t: 'group', id: 'late', label: 'Arrives last' }),
    ]);
    expect(diagram.nodes[0]!.group).toBeUndefined();
    expect(diagram.nodes[1]!.group).toBe('late');
    expect(diagram.groups.map((g) => g.id)).toEqual(['late']);
  });

  it('colours a box like its group unless it has a colour of its own', () => {
    const { diagram } = collectDiagram([
      line({ t: 'group', id: 'g', label: 'G', color: 'teal' }),
      line({ t: 'node', id: 'a', kind: 'rectangle', text: 'A', group: 'g' }),
      line({ t: 'node', id: 'b', kind: 'rectangle', text: 'B', group: 'g', color: 'red' }),
    ]);
    expect(diagram.nodes.map((n) => n.color)).toEqual(['teal', 'red']);
  });
});

/** A small system: a client outside two groups, arrows in and between them. */
const system = () => [
  line({ t: 'meta', direction: 'LR' }),
  line({ t: 'text', id: 'title', text: 'Shop', size: 'title' }),
  line({ t: 'group', id: 'edge', label: 'Edge', color: 'blue' }),
  line({ t: 'group', id: 'data', label: 'Data', color: 'green' }),
  line({ t: 'node', id: 'phone', kind: 'icon', icon: 'phone', text: 'Phone' }),
  line({
    t: 'node',
    id: 'lb',
    kind: 'rectangle',
    icon: 'load-balancer',
    text: 'Load balancer',
    group: 'edge',
  }),
  line({ t: 'node', id: 'api', kind: 'rectangle', text: 'API', group: 'edge' }),
  line({ t: 'node', id: 'db', kind: 'rectangle', icon: 'database', text: 'Orders', group: 'data' }),
  line({ t: 'node', id: 'cache', kind: 'rectangle', text: 'Cache', group: 'data' }),
  line({ t: 'node', id: 'check', kind: 'diamond', text: 'Cached?' }),
  line({ t: 'edge', from: 'phone', to: 'lb', dir: 'both' }),
  line({ t: 'edge', from: 'lb', to: 'api' }),
  line({ t: 'edge', from: 'api', to: 'check' }),
  line({ t: 'edge', from: 'check', to: 'cache', label: 'yes' }),
  line({ t: 'edge', from: 'check', to: 'db', label: 'no', style: 'dashed' }),
  line({ t: 'edge', from: 'phone', to: 'db' }),
];

const icons = () => ({
  fileId: 'icon-file',
  mimeType: 'image/svg+xml',
  naturalWidth: 96,
  naturalHeight: 96,
});

describe('layoutDiagramWithElk', () => {
  it('puts every group around its members, and nothing else inside it', async () => {
    const { diagram } = collectDiagram(system());
    const laid = await layoutDiagramWithElk(diagram, elk);
    for (const group of laid.groups) {
      for (const node of laid.nodes) {
        const inside =
          node.x >= group.x &&
          node.y >= group.y &&
          node.x + node.width <= group.x + group.width &&
          node.y + node.height <= group.y + group.height;
        expect(inside, `${node.id} in ${group.id}`).toBe(node.group === group.id);
      }
    }
  });

  it('routes every arrow in right angles, round the boxes it does not join', async () => {
    const { diagram } = collectDiagram(system());
    const laid = await layoutDiagramWithElk(diagram, elk);
    for (const edge of laid.edges) {
      const route = edge.route!;
      expect(route.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1]!;
        const b = route[i]!;
        expect(Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5).toBe(true);
        for (const node of laid.nodes) {
          if (node.id === edge.from || node.id === edge.to) continue;
          const crosses =
            Math.max(a.x, b.x) > node.x + 1 &&
            Math.min(a.x, b.x) < node.x + node.width - 1 &&
            Math.max(a.y, b.y) > node.y + 1 &&
            Math.min(a.y, b.y) < node.y + node.height - 1;
          expect(crosses, `${edge.from}→${edge.to} through ${node.id}`).toBe(false);
        }
      }
    }
  });

  it('puts the title above everything else and starts at the origin', async () => {
    const { diagram } = collectDiagram(system());
    const laid = await layoutDiagramWithElk(diagram, elk);
    const title = laid.texts.find((t) => t.id === 'title')!;
    expect(title.x).toBe(0);
    expect(title.y).toBe(0);
    for (const node of laid.nodes) expect(node.y).toBeGreaterThan(title.y + title.height);
  });
});

describe('a diagram drawn in full', () => {
  const draw = () => buildDiagramWithElk(system(), counter(), { elk, icons });

  it('makes each group an ordinary box behind its members, its name inside the top', async () => {
    const { shapes } = await draw();
    expect(shapes.some((s) => s.kind === 'frame')).toBe(false);
    const name = shapes.find((s): s is TextShape => s.kind === 'text' && s.text === 'Edge')!;
    const group = shapes.find(
      (s) =>
        s.kind === 'rectangle' &&
        name.x > s.x &&
        name.y > s.y &&
        name.x < s.x + shapeBounds(s).width &&
        name.y < s.y + 40,
    )!;
    expect(group).toBeDefined();
    const api = shapes.find((s): s is TextShape => s.kind === 'text' && s.text === 'API')!;
    expect(api.x).toBeGreaterThan(group.x);
    expect(api.x).toBeLessThan(group.x + shapeBounds(group).width);
    // Behind everything standing in it.
    expect(shapes.indexOf(group)).toBeLessThan(shapes.indexOf(api));
  });

  it('draws icons as pictures, a lone icon with its words beneath', async () => {
    const { shapes } = await draw();
    const pictures = shapes.filter((s): s is ImageShape => s.kind === 'image');
    // Phone on its own, and beside the words in two boxes.
    expect(pictures).toHaveLength(3);
    expect(pictures.every((p) => p.fileId === 'icon-file' && p.status === 'pending')).toBe(true);
    const phone = pictures.find((p) => p.width === 56)!;
    const words = shapes.find((s): s is TextShape => s.kind === 'text' && s.text === 'Phone')!;
    expect(words.y).toBeGreaterThan(phone.y + phone.height);
  });

  it('draws in the style it is given, like a shape drawn by hand', async () => {
    const style = {
      strokeWidth: 4,
      strokeStyle: 'solid' as const,
      roughness: 2 as const,
      edges: 'sharp' as const,
      fillStyle: 'cross-hatch' as const,
      filled: true,
      fontFamily: 'Helvetica, Arial, system-ui, sans-serif',
      fontSize: 28,
      arrowhead: 'circle' as const,
    };
    const { shapes } = await buildDiagramWithElk(system(), counter(), { elk, icons, style });
    const box = shapes.find((s) => s.kind === 'rectangle' && s.fillStyle === 'cross-hatch')!;
    expect(box.strokeWidth).toBe(4);
    expect(box.roughness).toBe(2);
    expect(box.scale).toBeUndefined();
    const words = shapes.find((s): s is TextShape => s.kind === 'text' && s.text === 'API')!;
    expect(words.fontSize).toBe(28);
    expect(words.fontFamily).toContain('Helvetica');
    const arrow = shapes.find((s): s is ArrowShape => s.kind === 'arrow')!;
    expect(arrow.endArrowhead).toBe('circle');
  });

  it('leaves boxes empty when the style has no fill, as a drawn box is', async () => {
    const { shapes } = await draw();
    const box = shapes.find((s) => s.kind === 'diamond')!;
    expect(box.fillColor).toBeNull();
  });

  it('grows the whole diagram by the scale a drawn shape would get', async () => {
    const plain = (await draw()).shapes;
    const grown = (await buildDiagramWithElk(system(), counter(), { elk, icons, scale: 2 })).shapes;
    const width = (list: Shape[]) => Math.max(...list.map((s) => s.x + shapeBounds(s).width));
    expect(width(grown)).toBeCloseTo(width(plain) * 2, -1);
    expect(grown.find((s) => s.kind === 'rectangle')!.scale).toBe(2);
  });

  it('gives a two-way edge both heads and a dashed edge a dashed line', async () => {
    const { shapes } = await draw();
    const arrows = shapes.filter((s): s is ArrowShape => s.kind === 'arrow');
    expect(arrows.some((a) => a.startArrowhead !== 'none' && a.endArrowhead !== 'none')).toBe(true);
    expect(arrows.find((a) => a.label === 'no')!.strokeStyle).toBe('dashed');
  });

  it('fixes each arrow to its shapes and keeps its right angles when one moves', async () => {
    const { shapes } = await draw();
    const byId = new Map(shapes.map((s) => [s.id, s]));
    const bent = shapes.find((s): s is ArrowShape => s.kind === 'arrow' && s.points.length > 2)!;
    expect(bent.startBinding!.precise).toBe(true);

    const target = byId.get(bent.endBinding!.shapeId)!;
    byId.set(target.id, { ...target, x: target.x + 30, y: target.y + 45 });
    const [patch] = boundArrowPatches([bent], byId);
    expect(patch!.points.length).toBe(bent.points.length);
    for (let i = 1; i < patch!.points.length; i++) {
      const [ax, ay] = patch!.points[i - 1]!;
      const [bx, by] = patch!.points[i]!;
      expect(Math.abs(ax - bx) < 0.5 || Math.abs(ay - by) < 0.5).toBe(true);
    }
  });

  it('is deterministic — the same lines give the same board', async () => {
    const first = (await buildDiagramWithElk(system(), counter(), { elk, icons })).shapes;
    const second = (await buildDiagramWithElk(system(), counter(), { elk, icons })).shapes;
    expect(first).toEqual(second);
  });

  it('falls back to the quick layout when ELK fails', async () => {
    const broken: ElkLike = { layout: () => Promise.reject(new Error('no')) };
    const { shapes } = await buildDiagramWithElk(system(), counter(), { elk: broken, icons });
    expect(shapes.filter((s) => s.kind === 'arrow')).toHaveLength(6);
  });
});

describe('arrow labels on a bent route', () => {
  it('sit on the longest run, not on a corner', async () => {
    const { shapes } = await buildDiagramWithElk(
      [
        line({ t: 'meta', direction: 'TB' }),
        line({ t: 'node', id: 'a', kind: 'rectangle', text: 'A' }),
        line({ t: 'node', id: 'b', kind: 'rectangle', text: 'B' }),
        line({ t: 'node', id: 'c', kind: 'rectangle', text: 'C' }),
        line({ t: 'node', id: 'd', kind: 'rectangle', text: 'D' }),
        line({ t: 'edge', from: 'a', to: 'b' }),
        line({ t: 'edge', from: 'a', to: 'c' }),
        line({ t: 'edge', from: 'a', to: 'd', label: 'third' }),
      ],
      counter(),
      { elk },
    );
    const arrow = shapes.find((s): s is ArrowShape => s.kind === 'arrow' && s.label === 'third')!;
    expect(arrow.points.length % 2).toBe(0);
    const runs = arrow.points.slice(1).map(([x, y], i) => {
      const [px, py] = arrow.points[i]!;
      return Math.hypot(x - px, y - py);
    });
    // The middle run of the stored points is as long as any run of the route.
    const middle = arrow.points.length / 2 - 1;
    const original = Math.max(...runs);
    expect(runs[middle]).toBeGreaterThanOrEqual(original - 0.5);
  });
});
