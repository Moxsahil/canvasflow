import { describe, expect, it } from 'vitest';
import { buildDiagram, collectDiagram, parseDiagramLine } from '../src/diagram/index.js';
import { layoutDiagram } from '../src/diagram/layout.js';
import { diagramToShapes } from '../src/diagram/to-shapes.js';
import type { DiagramIR } from '../src/diagram/ir.js';
import type { ArrowShape, Shape, TextShape } from '../src/shapes/shape.js';
import { shapeBounds } from '../src/shapes/bounds.js';

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
    const shapes = diagramToShapes({ nodes, edges: [] }, counter());
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
    const boxes = shapes.filter((s) => s.kind === 'rectangle' || s.kind === 'diamond');

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
});
