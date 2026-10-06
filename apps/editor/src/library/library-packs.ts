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
  type BaseStyleInput,
  type Edges,
  type Shape,
} from '@canvasflow/canvas-engine';
import { FONT_FAMILIES } from '../properties/palette';

/**
 * The packs that come with the editor: a few sets of the things boards are
 * most often built from, drawn in the board's own shapes and fonts.
 *
 * Built here rather than shipped as files, so they cannot drift from the shape
 * model, and are there with no request at all.
 */

export interface PackItem {
  /** Stable, so Recently used can name it: `pack:<pack>:<item>`. */
  readonly id: string;
  readonly name: string;
  readonly shapes: readonly Shape[];
}

export interface LibraryPack {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly items: readonly PackItem[];
}

const [HAND, NORMAL] = FONT_FAMILIES.map((font) => font.value) as [string, string];

/**
 * Ink for words on a coloured fill. Not the default pen, which turns light on
 * a dark board — a fill keeps its colour in both themes, so the words on it
 * have to keep theirs.
 */
const ON_FILL = '#343a40';
const MUTED = '#868e96';
const BLUE = '#1971c2';
const RED = '#e03131';
const YELLOW = '#ffec99';
const PINK = '#ffc9c9';
const GREEN = '#b2f2bb';
const SKY = '#a5d8ff';

type Style = BaseStyleInput & { edges?: Edges };
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TextOptions {
  size?: number;
  align?: 'left' | 'center' | 'right';
  color?: string;
  font?: string;
}

/** Draws one item's shapes, numbering them and seeding them so a pack looks the same every time. */
class Item {
  readonly shapes: Shape[] = [];
  private count = 0;

  constructor(
    private readonly prefix: string,
    private readonly style: Style,
    private readonly font: string,
  ) {}

  private next() {
    this.count += 1;
    return { id: `${this.prefix}-${this.count}`, seed: 1000 + this.count * 7919 };
  }

  private add<T extends Shape>(shape: T): string {
    this.shapes.push(shape);
    return shape.id;
  }

  rect({ x, y, w, h }: Box, style: Style = {}): string {
    return this.add(
      createRectangle({ ...this.next(), x, y, width: w, height: h, ...this.style, ...style }),
    );
  }

  ellipse({ x, y, w, h }: Box, style: Style = {}): string {
    const { edges: _edges, ...rest } = { ...this.style, ...style };
    return this.add(createEllipse({ ...this.next(), x, y, width: w, height: h, ...rest }));
  }

  diamond({ x, y, w, h }: Box, style: Style = {}): string {
    return this.add(
      createDiamond({ ...this.next(), x, y, width: w, height: h, ...this.style, ...style }),
    );
  }

  line(x: number, y: number, points: [number, number][], style: Style = {}): string {
    return this.add(createLine({ ...this.next(), x, y, points, ...this.style, ...style }));
  }

  frame({ x, y, w, h }: Box, name: string): string {
    return this.add(createFrame({ ...this.next(), x, y, width: w, height: h, name }));
  }

  /** Text whose top sits at `y`, placed by its alignment point at `x`. */
  text(x: number, y: number, words: string, options: TextOptions = {}): string {
    const { edges: _edges, fillColor: _fill, ...rest } = this.style;
    return this.add(
      createText({
        ...this.next(),
        ...rest,
        x,
        y,
        text: words,
        fontSize: options.size ?? 20,
        fontFamily: options.font ?? this.font,
        textAlign: options.align ?? 'left',
        ...(options.color && { strokeColor: options.color }),
      }),
    );
  }

  /** Text in the middle of a box, both ways. */
  label(box: Box, words: string, options: TextOptions = {}): string {
    const size = options.size ?? 20;
    const height = words.split('\n').length * size * 1.2;
    return this.text(box.x + box.w / 2, box.y + (box.h - height) / 2, words, {
      ...options,
      size,
      align: 'center',
    });
  }

  /** An arrow between two points, attached at either end to a shape where one is named. */
  arrow(
    from: [number, number],
    to: [number, number],
    options: {
      start?: string;
      end?: string;
      label?: string;
      startArrowhead?: Arrowhead;
      endArrowhead?: Arrowhead;
    } & Style = {},
  ): string {
    const { start, end, label, startArrowhead, endArrowhead, ...style } = options;
    const { edges: _edges, ...rest } = { ...this.style, ...style };
    const bound = (shapeId?: string): ArrowBinding | null =>
      shapeId ? { shapeId, anchor: { x: 0.5, y: 0.5 }, precise: false } : null;
    return this.add(
      createArrow({
        ...this.next(),
        ...rest,
        x: from[0],
        y: from[1],
        points: [
          [0, 0],
          [to[0] - from[0], to[1] - from[1]],
        ],
        startBinding: bound(start),
        endBinding: bound(end),
        ...(label !== undefined && { label }),
        ...(startArrowhead && { startArrowhead }),
        ...(endArrowhead && { endArrowhead }),
      }),
    );
  }
}

function pack(
  id: string,
  name: string,
  description: string,
  style: Style,
  font: string,
  items: [name: string, draw: (item: Item) => void][],
): LibraryPack {
  return {
    id,
    name,
    description,
    items: items.map(([itemName, draw], index) => {
      const item = new Item(`${id}-${index}`, style, font);
      draw(item);
      return { id: `pack:${id}:${index}`, name: itemName, shapes: item.shapes };
    }),
  };
}

const flowchart = pack(
  'flowchart',
  'Flowchart',
  'Steps, decisions and the arrows between them.',
  { strokeWidth: 2, roughness: 1 },
  HAND,
  [
    [
      'Start / end',
      (d) => {
        const box = { x: 0, y: 0, w: 160, h: 64 };
        d.ellipse(box);
        d.label(box, 'Start');
      },
    ],
    [
      'Process',
      (d) => {
        const box = { x: 0, y: 0, w: 160, h: 64 };
        d.rect(box, { edges: 'round' });
        d.label(box, 'Process');
      },
    ],
    [
      'Decision',
      (d) => {
        const box = { x: 0, y: 0, w: 160, h: 110 };
        d.diamond(box);
        d.label(box, 'Decision?', { size: 18 });
      },
    ],
    [
      'Input / output',
      (d) => {
        d.line(0, 0, [
          [28, 0],
          [180, 0],
          [152, 64],
          [0, 64],
          [28, 0],
        ]);
        d.label({ x: 0, y: 0, w: 180, h: 64 }, 'Input');
      },
    ],
    [
      'Database',
      (d) => {
        d.ellipse({ x: 0, y: 0, w: 120, h: 30 });
        d.line(0, 15, [
          [0, 0],
          [0, 80],
        ]);
        d.line(120, 15, [
          [0, 0],
          [0, 80],
        ]);
        d.ellipse({ x: 0, y: 80, w: 120, h: 30 });
        d.label({ x: 0, y: 30, w: 120, h: 50 }, 'Database', { size: 18 });
      },
    ],
    [
      'Step to step',
      (d) => {
        const a = { x: 0, y: 0, w: 140, h: 60 };
        const b = { x: 220, y: 0, w: 140, h: 60 };
        const first = d.rect(a, { edges: 'round' });
        d.label(a, 'Step 1');
        const second = d.rect(b, { edges: 'round' });
        d.label(b, 'Step 2');
        d.arrow([140, 30], [220, 30], { start: first, end: second });
      },
    ],
    [
      'Yes / no',
      (d) => {
        const question = { x: 0, y: 0, w: 140, h: 100 };
        const yes = { x: 240, y: 20, w: 120, h: 60 };
        const no = { x: 10, y: 180, w: 120, h: 60 };
        const ask = d.diamond(question);
        d.label(question, 'Ready?', { size: 18 });
        const go = d.rect(yes, { edges: 'round' });
        d.label(yes, 'Go');
        const fix = d.rect(no, { edges: 'round' });
        d.label(no, 'Fix it');
        d.arrow([140, 50], [240, 50], { start: ask, end: go, label: 'Yes' });
        d.arrow([70, 100], [70, 180], { start: ask, end: fix, label: 'No' });
      },
    ],
    [
      'Labelled arrow',
      (d) => {
        d.arrow([0, 0], [200, 0], { label: 'then' });
      },
    ],
    [
      'Swimlane',
      (d) => {
        d.frame({ x: 0, y: 0, w: 720, h: 200 }, 'Lane');
      },
    ],
  ],
);

const wireframe = pack(
  'wireframe',
  'Wireframe',
  'Screens and the controls on them, plain and to scale.',
  { strokeWidth: 1, roughness: 0 },
  NORMAL,
  [
    [
      'Button',
      (d) => {
        const box = { x: 0, y: 0, w: 120, h: 40 };
        d.rect(box, { edges: 'round', fillColor: SKY, fillStyle: 'solid' });
        d.label(box, 'Button', { size: 16, color: ON_FILL });
      },
    ],
    [
      'Text field',
      (d) => {
        d.text(0, 0, 'Label', { size: 14 });
        d.rect({ x: 0, y: 22, w: 240, h: 40 }, { edges: 'round' });
        d.text(12, 33, 'Placeholder', { size: 16, color: MUTED });
      },
    ],
    [
      'Search field',
      (d) => {
        d.rect({ x: 0, y: 0, w: 280, h: 40 }, { edges: 'round' });
        d.ellipse({ x: 12, y: 11, w: 14, h: 14 }, { strokeColor: MUTED, strokeWidth: 2 });
        d.line(
          24,
          23,
          [
            [0, 0],
            [6, 6],
          ],
          { strokeColor: MUTED, strokeWidth: 2 },
        );
        d.text(40, 11, 'Search', { size: 16, color: MUTED });
      },
    ],
    [
      'Dropdown',
      (d) => {
        d.rect({ x: 0, y: 0, w: 200, h: 40 }, { edges: 'round' });
        d.text(12, 11, 'Choose…', { size: 16 });
        d.line(176, 16, [
          [0, 0],
          [6, 6],
          [12, 0],
        ]);
      },
    ],
    [
      'Checkbox',
      (d) => {
        d.rect({ x: 0, y: 1, w: 18, h: 18 }, { edges: 'round' });
        d.line(
          3,
          10,
          [
            [0, 0],
            [4, 5],
            [12, -5],
          ],
          { strokeColor: BLUE, strokeWidth: 2 },
        );
        d.text(28, 0, 'Remember me', { size: 16 });
      },
    ],
    [
      'Radio buttons',
      (d) => {
        d.ellipse({ x: 0, y: 1, w: 18, h: 18 });
        d.ellipse(
          { x: 5, y: 6, w: 8, h: 8 },
          { fillColor: BLUE, fillStyle: 'solid', strokeColor: BLUE },
        );
        d.text(28, 0, 'Option A', { size: 16 });
        d.ellipse({ x: 0, y: 31, w: 18, h: 18 });
        d.text(28, 30, 'Option B', { size: 16 });
      },
    ],
    [
      'Toggle',
      (d) => {
        d.rect(
          { x: 0, y: 0, w: 44, h: 24 },
          { edges: 'round', fillColor: BLUE, fillStyle: 'solid', strokeColor: BLUE },
        );
        d.ellipse(
          { x: 22, y: 2, w: 20, h: 20 },
          { fillColor: '#ffffff', fillStyle: 'solid', strokeColor: '#ffffff' },
        );
        d.text(56, 2, 'Notifications', { size: 16 });
      },
    ],
    [
      'Avatar',
      (d) => {
        const box = { x: 0, y: 0, w: 48, h: 48 };
        d.ellipse(box, { fillColor: GREEN, fillStyle: 'solid' });
        d.label(box, 'AB', { size: 18, color: ON_FILL });
      },
    ],
    [
      'Image',
      (d) => {
        d.rect({ x: 0, y: 0, w: 200, h: 140 });
        d.line(0, 0, [
          [0, 0],
          [200, 140],
        ]);
        d.line(0, 140, [
          [0, 0],
          [200, -140],
        ]);
      },
    ],
    [
      'Card',
      (d) => {
        d.rect({ x: 0, y: 0, w: 240, h: 230 }, { edges: 'round' });
        d.rect({ x: 12, y: 12, w: 216, h: 110 });
        d.line(12, 12, [
          [0, 0],
          [216, 110],
        ]);
        d.line(12, 122, [
          [0, 0],
          [216, -110],
        ]);
        d.text(12, 136, 'Card title', { size: 18 });
        d.text(12, 166, 'A line or two about\nwhat this card holds.', {
          size: 14,
          color: MUTED,
        });
      },
    ],
    [
      'Navigation bar',
      (d) => {
        d.rect({ x: 0, y: 0, w: 640, h: 56 });
        d.text(16, 16, 'Logo', { size: 20 });
        d.text(340, 19, 'Home', { size: 15 });
        d.text(405, 19, 'Pricing', { size: 15 });
        d.text(480, 19, 'About', { size: 15 });
        const button = { x: 548, y: 10, w: 80, h: 36 };
        d.rect(button, { edges: 'round', fillColor: SKY, fillStyle: 'solid' });
        d.label(button, 'Sign up', { size: 15, color: ON_FILL });
      },
    ],
    [
      'Dialog',
      (d) => {
        d.rect({ x: 0, y: 0, w: 360, h: 196 }, { edges: 'round' });
        d.text(20, 20, 'Delete this board?', { size: 20 });
        d.text(20, 58, 'It goes for everyone it is shared with.', {
          size: 14,
          color: MUTED,
        });
        const cancel = { x: 156, y: 140, w: 88, h: 36 };
        d.rect(cancel, { edges: 'round' });
        d.label(cancel, 'Cancel', { size: 15 });
        const confirm = { x: 256, y: 140, w: 88, h: 36 };
        d.rect(confirm, { edges: 'round', fillColor: PINK, fillStyle: 'solid' });
        d.label(confirm, 'Delete', { size: 15, color: ON_FILL });
      },
    ],
    [
      'Phone screen',
      (d) => {
        d.frame({ x: 0, y: 0, w: 390, h: 844 }, 'Phone');
      },
    ],
    [
      'Desktop screen',
      (d) => {
        d.frame({ x: 0, y: 0, w: 1280, h: 800 }, 'Desktop');
      },
    ],
  ],
);

const notes = pack(
  'notes',
  'Notes',
  'Sticky notes, markers and callouts for talking about a board.',
  { strokeWidth: 2, roughness: 1 },
  HAND,
  [
    ...(
      [
        ['Yellow sticky note', YELLOW],
        ['Pink sticky note', PINK],
        ['Green sticky note', GREEN],
        ['Blue sticky note', SKY],
      ] as const
    ).map(([name, colour]): [string, (d: Item) => void] => [
      name,
      (d) => {
        d.rect(
          { x: 0, y: 0, w: 200, h: 200 },
          { fillColor: colour, fillStyle: 'solid', strokeColor: colour, roughness: 0 },
        );
        d.text(16, 16, 'Idea', { size: 24, color: ON_FILL });
      },
    ]),
    [
      'Numbered marker',
      (d) => {
        const box = { x: 0, y: 0, w: 36, h: 36 };
        d.ellipse(box, { fillColor: RED, fillStyle: 'solid', strokeColor: RED });
        d.label(box, '1', { size: 20, color: '#ffffff' });
      },
    ],
    [
      'Question',
      (d) => {
        const box = { x: 0, y: 0, w: 40, h: 40 };
        d.ellipse(box, { strokeColor: BLUE });
        d.label(box, '?', { size: 26, color: BLUE });
      },
    ],
    [
      'Callout',
      (d) => {
        const box = { x: 60, y: 0, w: 220, h: 80 };
        const note = d.rect(box, { edges: 'round' });
        d.label(box, 'Look here');
        d.arrow([110, 80], [20, 150], { start: note });
      },
    ],
    [
      'Highlight',
      (d) => {
        d.rect(
          { x: 0, y: 0, w: 240, h: 40 },
          { fillColor: YELLOW, fillStyle: 'solid', strokeColor: YELLOW, roughness: 0, opacity: 60 },
        );
      },
    ],
    [
      'Heading',
      (d) => {
        d.text(0, 0, 'Heading', { size: 40 });
        d.line(0, 56, [
          [0, 0],
          [220, 0],
        ]);
      },
    ],
    [
      'Checklist',
      (d) => {
        ['First thing', 'Second thing', 'Third thing'].forEach((words, row) => {
          const y = row * 34;
          d.rect({ x: 0, y: y + 2, w: 20, h: 20 });
          if (row === 0) {
            d.line(
              4,
              y + 12,
              [
                [0, 0],
                [5, 6],
                [14, -6],
              ],
              { strokeColor: '#2f9e44' },
            );
          }
          d.text(32, y, words, { size: 22 });
        });
      },
    ],
    [
      'Pros and cons',
      (d) => {
        const pros = { x: 0, y: 0, w: 200, h: 180 };
        const cons = { x: 220, y: 0, w: 200, h: 180 };
        d.rect(pros, { fillColor: GREEN, fillStyle: 'solid', strokeColor: GREEN, roughness: 0 });
        d.text(100, 14, 'Pros', { size: 24, align: 'center', color: ON_FILL });
        d.rect(cons, { fillColor: PINK, fillStyle: 'solid', strokeColor: PINK, roughness: 0 });
        d.text(320, 14, 'Cons', { size: 24, align: 'center', color: ON_FILL });
      },
    ],
    [
      'Divider',
      (d) => {
        d.line(
          0,
          0,
          [
            [0, 0],
            [480, 0],
          ],
          { strokeStyle: 'dashed' },
        );
      },
    ],
  ],
);

export const LIBRARY_PACKS: readonly LibraryPack[] = [flowchart, wireframe, notes];
