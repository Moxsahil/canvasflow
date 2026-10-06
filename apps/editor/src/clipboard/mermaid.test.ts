import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createArrow,
  createDiamond,
  createEllipse,
  createFrame,
  createLine,
  createRectangle,
  createText,
  type Arrowhead,
  type ArrowBinding,
  type Shape,
  type StrokeStyle,
} from '@canvasflow/canvas-engine';
import { hasFlowchart, mermaidFlowchart } from './mermaid';

// Text is measured on a canvas, which this environment does not have: a
// stand-in that makes every character half as wide as the font is tall.
const realOffscreenCanvas = globalThis.OffscreenCanvas;
beforeAll(() => {
  globalThis.OffscreenCanvas = class {
    getContext() {
      return {
        font: '10px sans-serif',
        measureText(this: { font: string }, text: string) {
          return { width: text.length * parseFloat(this.font) * 0.5 };
        },
      };
    }
  } as never;
});
afterAll(() => {
  globalThis.OffscreenCanvas = realOffscreenCanvas;
});

/** A box, with writing laid over it when given some — which is how a box says anything. */
function labelled(box: Shape, words?: string): Shape[] {
  if (words === undefined) return [box];
  return [box, createText({ id: `${box.id}-words`, x: box.x + 10, y: box.y + 10, text: words })];
}

function rect(id: string, x: number, y: number, words?: string, round = false): Shape[] {
  const box = createRectangle({
    id,
    x,
    y,
    width: 100,
    height: 40,
    edges: round ? 'round' : 'sharp',
  });
  return labelled(box, words);
}

function tied(shapeId: string): ArrowBinding {
  return { shapeId, anchor: { x: 0.5, y: 0.5 }, precise: false };
}

function arrow(
  id: string,
  from: string | null,
  to: string | null,
  options: {
    label?: string;
    startArrowhead?: Arrowhead;
    endArrowhead?: Arrowhead;
    strokeStyle?: StrokeStyle;
  } = {},
): Shape {
  return createArrow({
    id,
    x: 0,
    y: 0,
    points: [
      [0, 0],
      [10, 10],
    ],
    startBinding: from ? tied(from) : null,
    endBinding: to ? tied(to) : null,
    ...options,
  });
}

describe('mermaidFlowchart', () => {
  it('writes each box in its outline and each tied arrow as a link', () => {
    const shapes = [
      ...rect('start', 0, 0, 'Start', true),
      ...labelled(createDiamond({ id: 'ask', x: 0, y: 100, width: 100, height: 60 }), 'Paid?'),
      ...labelled(createEllipse({ id: 'done', x: 0, y: 220, width: 80, height: 80 }), 'Done'),
      ...rect('retry', 200, 100, 'Retry'),
      arrow('a1', 'start', 'ask'),
      arrow('a2', 'ask', 'done', { label: 'yes' }),
      arrow('a3', 'ask', 'retry', { label: 'no', strokeStyle: 'dashed' }),
    ];

    expect(mermaidFlowchart(shapes)).toBe(
      [
        'flowchart TD',
        '  n1("Start")',
        '  n2{"Paid?"}',
        '  n3["Retry"]',
        '  n4(("Done"))',
        '  n1 --> n2',
        '  n2 -.->|"no"| n3',
        '  n2 -->|"yes"| n4',
      ].join('\n'),
    );
  });

  it('takes an arrow tied to the writing in a box as tied to the box', () => {
    const shapes = [
      ...rect('a', 0, 0, 'A'),
      ...rect('b', 0, 200, 'B'),
      arrow('x', 'a-words', 'b-words'),
    ];

    expect(mermaidFlowchart(shapes)).toBe(
      ['flowchart TD', '  n1["A"]', '  n2["B"]', '  n1 --> n2'].join('\n'),
    );
  });

  it('reads every line of writing in a box, and gives it to the smallest box around it', () => {
    const outer = createRectangle({ id: 'outer', x: 0, y: 0, width: 400, height: 300 });
    const inner = createRectangle({ id: 'inner', x: 100, y: 100, width: 200, height: 100 });
    const shapes = [
      outer,
      inner,
      createText({ id: 'title', x: 10, y: 10, text: 'Outer' }),
      createText({ id: 'sub', x: 10, y: 40, text: 'second line' }),
      createText({ id: 'in', x: 110, y: 110, text: 'Inner' }),
    ];

    expect(mermaidFlowchart(shapes)).toBe(
      ['flowchart TD', '  n1["Outer<br>second line"]', '  n2["Inner"]'].join('\n'),
    );
  });

  it('runs across when the arrows do', () => {
    const shapes = [...rect('a', 0, 0, 'A'), ...rect('b', 300, 0, 'B'), arrow('x', 'a', 'b')];

    expect(mermaidFlowchart(shapes)?.split('\n')[0]).toBe('flowchart LR');
  });

  it('follows the arrowheads: reversed, both ways, or none', () => {
    const shapes = [
      ...rect('a', 0, 0, 'A'),
      ...rect('b', 0, 100, 'B'),
      arrow('back', 'a', 'b', { startArrowhead: 'arrow', endArrowhead: 'none' }),
      arrow('both', 'a', 'b', { startArrowhead: 'arrow', endArrowhead: 'triangle' }),
      arrow('plain', 'a', 'b', { endArrowhead: 'none', strokeStyle: 'dotted' }),
    ];
    const links = mermaidFlowchart(shapes)?.split('\n').slice(3);

    expect(links).toEqual(['  n2 --> n1', '  n1 <--> n2', '  n1 -.- n2']);
  });

  it('leaves out an arrow loose at either end, and what is neither boxed nor tied', () => {
    const shapes = [
      ...rect('a', 0, 0, 'A'),
      createText({ id: 'note', x: 300, y: 0, text: 'a note' }),
      createLine({
        id: 'l',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [5, 5],
        ],
      }),
      arrow('loose', 'a', null),
    ];

    expect(mermaidFlowchart(shapes)).toBe('flowchart TD\n  n1["A"]');
  });

  it('makes a node of writing outside any box that an arrow points at', () => {
    const shapes = [
      ...rect('a', 0, 0, 'A'),
      createText({ id: 'note', x: 0, y: 200, text: 'Note' }),
      arrow('x', 'a', 'note'),
    ];

    expect(mermaidFlowchart(shapes)).toContain('  n2["Note"]\n  n1 --> n2');
  });

  it('wraps what stands in a frame in a subgraph named after it', () => {
    const [pay, payWords] = rect('pay', 20, 40, 'Pay');
    const shapes = [
      createFrame({ id: 'f', x: 0, y: 0, width: 400, height: 300, name: 'Checkout' }),
      { ...pay!, frameId: 'f' },
      { ...payWords!, frameId: 'f' },
      ...rect('ship', 600, 40, 'Ship'),
      arrow('x', 'pay', 'ship'),
    ];

    expect(mermaidFlowchart(shapes)).toBe(
      [
        'flowchart LR',
        '  subgraph f1["Checkout"]',
        '    n1["Pay"]',
        '  end',
        '  n2["Ship"]',
        '  n1 --> n2',
      ].join('\n'),
    );
  });

  it('keeps any label from breaking the syntax', () => {
    const wide = createRectangle({ id: 'a', x: 0, y: 0, width: 400, height: 100 });
    const shapes = [...labelled(wide, 'Say "hi" <b>#1</b> `now`\nthen stop'), ...rect('b', 0, 200)];

    expect(mermaidFlowchart(shapes)).toBe(
      [
        'flowchart TD',
        '  n1["Say #quot;hi#quot; #lt;b#gt;#35;1#lt;/b#gt; #96;now#96;<br>then stop"]',
        '  n2[" "]',
      ].join('\n'),
    );
  });

  it('has nothing to say without a box or a tied arrow', () => {
    const shapes = [createText({ id: 't', x: 0, y: 0, text: 'just words' })];

    expect(mermaidFlowchart(shapes)).toBeNull();
    expect(hasFlowchart(shapes)).toBe(false);
    expect(hasFlowchart(rect('a', 0, 0))).toBe(true);
  });
});
