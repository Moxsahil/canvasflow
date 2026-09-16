import { arrowBounds, createArrow } from '../src/shapes/arrow.js';
import {
  arrowLabelAnchor,
  arrowLabelFont,
  arrowLabelLayout,
  arrowLabelOf,
} from '../src/shapes/arrow-label.js';
import { drawSceneShape } from '../src/renderers/draw-shape.js';
import { createRoughCanvas } from '../src/utils/rough.js';
import type { ArrowShape } from '../src/shapes/shape.js';

function arrow(overrides: Partial<ArrowShape> = {}): ArrowShape {
  return {
    ...createArrow({
      id: 'a1',
      x: 0,
      y: 0,
      points: [
        [20, 60],
        [180, 60],
      ],
      roughness: 0,
      seed: 7,
    }),
    ...overrides,
  };
}

describe('arrowLabelAnchor', () => {
  it('takes the middle of the only segment of a two-point arrow', () => {
    expect(arrowLabelAnchor(arrow())).toEqual({ x: 100, y: 60 });
  });

  it('takes the middle vertex when there is one to take', () => {
    const bent = arrow({
      points: [
        [0, 0],
        [40, 90],
        [100, 0],
      ],
    });
    expect(arrowLabelAnchor(bent)).toEqual({ x: 40, y: 90 });
  });

  it('takes the middle of the central segment when there is no middle vertex', () => {
    const zigzag = arrow({
      points: [
        [0, 0],
        [10, 0],
        [30, 20],
        [40, 20],
      ],
    });
    expect(arrowLabelAnchor(zigzag)).toEqual({ x: 20, y: 10 });
  });

  it('moves with the arrow', () => {
    expect(arrowLabelAnchor(arrow({ x: 5, y: 7 }))).toEqual({ x: 105, y: 67 });
  });
});

describe('arrowLabelLayout', () => {
  it('gives nothing back for an arrow with no label', () => {
    expect(arrowLabelLayout(arrow())).toBeNull();
  });

  it('opens a gap for a caret before a single character is typed', () => {
    // The line has to break the moment the caret lands, or the caret stands on
    // the arrow rather than in it.
    const caret = arrowLabelLayout(arrow(), { caret: true });

    expect(caret).not.toBeNull();
    expect(caret!.box.width).toBeGreaterThan(0);
    expect(caret!.box.x + caret!.box.width / 2).toBeCloseTo(100, 6);
  });

  it('gives the caret no more room than the words once there are some', () => {
    const typed = arrowLabelLayout(arrow({ label: 'a long label' }), { caret: true })!;
    const committed = arrowLabelLayout(arrow({ label: 'a long label' }))!;

    expect(typed.box.width).toBeCloseTo(committed.box.width, 6);
  });

  it('centres the label box on the middle of the arrow', () => {
    const layout = arrowLabelLayout(arrow({ label: 'north' }))!;

    expect(layout.anchor).toEqual({ x: 100, y: 60 });
    expect(layout.box.x + layout.box.width / 2).toBeCloseTo(100, 6);
    expect(layout.box.y + layout.box.height / 2).toBeCloseTo(60, 6);
  });

  it('grows the box downward as lines are added, staying centred', () => {
    const one = arrowLabelLayout(arrow({ label: 'a' }))!;
    const three = arrowLabelLayout(arrow({ label: 'a\nb\nc' }))!;

    expect(three.box.height).toBeGreaterThan(one.box.height);
    expect(three.box.y + three.box.height / 2).toBeCloseTo(60, 6);
  });

  it('centres the glyphs on the arrow rather than hanging them above it', () => {
    // Measuring in whole line boxes counts leading under the last line that
    // nothing is drawn in, which lifts the text off centre — by a different
    // amount for one line than for three, so it cannot be nudged away.
    const one = arrowLabelLayout(arrow({ label: 'x' }))!;
    expect(one.textTop).toBeCloseTo(60 - one.fontSize / 2, 6);

    const three = arrowLabelLayout(arrow({ label: 'x\ny\nz' }))!;
    const inkHeight = 2 * three.fontSize * 1.2 + three.fontSize;
    expect(three.textTop).toBeCloseTo(60 - inkHeight / 2, 6);
  });

  it('takes its width from the longest line', () => {
    const short = arrowLabelLayout(arrow({ label: 'i' }))!;
    const long = arrowLabelLayout(arrow({ label: 'i\nmmmmmmmmmm' }))!;

    expect(long.box.width).toBeGreaterThan(short.box.width);
  });

  it('scales with the arrow it labels', () => {
    const plain = arrowLabelLayout(arrow({ label: 'x' }))!;
    const doubled = arrowLabelLayout(arrow({ label: 'x', scale: 2 }))!;

    expect(doubled.fontSize).toBeCloseTo(plain.fontSize * 2, 6);
    expect(doubled.box.height).toBeCloseTo(plain.box.height * 2, 6);
  });
});

describe('arrowLabelOf', () => {
  it('reads an arrow that predates labels as having none', () => {
    // What a board, a file or a clipboard payload written before this field
    // existed hands back.
    const legacy = { ...arrow(), label: undefined } as unknown as ArrowShape;

    expect(arrowLabelOf(legacy)).toBe('');
    expect(arrowLabelLayout(legacy)).toBeNull();
    expect(() => arrowBounds(legacy)).not.toThrow();
  });

  it('reads a value that is not text as no label', () => {
    const odd = { ...arrow(), label: { nope: true } } as unknown as ArrowShape;

    expect(arrowLabelOf(odd)).toBe('');
    expect(arrowLabelLayout(odd)).toBeNull();
  });
});

describe('arrowBounds', () => {
  it('is the arrow alone when it carries no label', () => {
    expect(arrowBounds(arrow())).toEqual({ x: 20, y: 60, width: 160, height: 0 });
  });

  it('opens up to hold the label', () => {
    // Without this the label falls outside the export, the zoom-to-fit and
    // everything a click is tested against.
    const labelled = arrowBounds(arrow({ label: 'north' }));
    const layout = arrowLabelLayout(arrow({ label: 'north' }))!;

    expect(labelled.y).toBeCloseTo(layout.box.y, 6);
    expect(labelled.y + labelled.height).toBeCloseTo(layout.box.y + layout.box.height, 6);
    // The arrow is wider than its label here, so the sides are unchanged.
    expect(labelled.x).toBe(20);
    expect(labelled.width).toBe(160);
  });
});

describe('painting a labelled arrow', () => {
  const W = 200;
  const H = 120;

  /** Whether anything was painted within a pixel of (x, y). */
  function inkAt(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number): boolean {
    const { data } = ctx.getImageData(x - 1, y - 1, 3, 3);
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) return true;
    return false;
  }

  function paint(shape: ArrowShape): OffscreenCanvasRenderingContext2D {
    const canvas = new OffscreenCanvas(W, H);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    drawSceneShape(ctx, createRoughCanvas(canvas), shape);
    return ctx;
  }

  it('breaks the line where the label sits, and leaves it whole where there is none', () => {
    const labelled = arrow({ label: 'north' });
    const layout = arrowLabelLayout(labelled)!;
    // Inside the label's padding: past the gap's edge, short of the glyphs.
    const x = Math.round(layout.box.x + 2);

    expect(inkAt(paint(labelled), x, 60)).toBe(false);
    expect(inkAt(paint(arrow()), x, 60)).toBe(true);
  });

  it('still paints the arrowheads outside the gap', () => {
    const ctx = paint(arrow({ label: 'north' }));
    expect(inkAt(ctx, 178, 60)).toBe(true);
  });

  it('paints the label itself', () => {
    const font = arrowLabelFont(arrow());
    expect(font.fontSize).toBeGreaterThan(0);
    expect(inkAt(paint(arrow({ label: 'north' })), 100, 60)).toBe(true);
  });

  describe('while the label is open for typing', () => {
    const paintEditing = (shape: ArrowShape) => {
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      drawSceneShape(ctx, createRoughCanvas(canvas), shape, false, {
        editingArrowLabelId: shape.id,
      });
      return ctx;
    };

    it('breaks the line for the caret before anything has been typed', () => {
      expect(inkAt(paintEditing(arrow()), 100, 60)).toBe(false);
      // Whereas the same arrow, not being typed into, is unbroken.
      expect(inkAt(paint(arrow()), 100, 60)).toBe(true);
    });

    it('leaves the words to the overlay that owns the caret', () => {
      const typed = arrow({ label: 'north' });
      const layout = arrowLabelLayout(typed)!;
      // Where a glyph would be: painted once committed, left blank while the
      // overlay is drawing it, so the two cannot double up a pixel apart.
      const x = Math.round(layout.anchor.x);

      expect(inkAt(paintEditing(typed), x, 60)).toBe(false);
      expect(inkAt(paint(typed), x, 60)).toBe(true);
    });

    it('still paints the rest of the arrow', () => {
      expect(inkAt(paintEditing(arrow()), 178, 60)).toBe(true);
      expect(inkAt(paintEditing(arrow()), 30, 60)).toBe(true);
    });
  });
});
