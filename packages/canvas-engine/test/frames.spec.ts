import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape.js';
import { frameHitAt, frameLabelAt, frameLabelBounds } from '../src/frames/frame-geometry.js';
import {
  descendantsOf,
  frameChain,
  frameForShape,
  frameIndex,
  frameWithMembers,
  framesIn,
  membersOf,
  membershipAfterResize,
  membershipChanges,
} from '../src/frames/membership.js';
import { hitTest } from '../src/hit-testing/hit-test.js';
import { segmentErasesShape } from '../src/hit-testing/erase-test.js';
import { renderStaticScene } from '../src/renderers/static.js';
import { renderSceneToSvgString } from '../src/renderers/svg-scene.js';
import { createFrame } from '../src/shapes/frame.js';
import { createRectangle } from '../src/shapes/rectangle.js';
import type { FrameShape, Shape } from '../src/shapes/shape.js';
import { SpatialIndex } from '../src/spatial/spatial-index.js';

function frame(overrides: Partial<Parameters<typeof createFrame>[0]> = {}): FrameShape {
  return createFrame({ id: 'f1', x: 0, y: 0, width: 200, height: 100, ...overrides });
}

function rect(id: string, x: number, y: number, size = 20): Shape {
  return createRectangle({ id, x, y, width: size, height: size });
}

/** Put a Y.Map into a doc, as it would be when read back off the wire. */
function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

describe('frame membership', () => {
  it('takes in a shape whose centre is inside it', () => {
    const f = frame();
    expect(frameForShape(rect('a', 90, 40), [f])).toBe('f1');
  });

  it('goes by the centre, so a shape mostly out is out', () => {
    const f = frame();

    // Overlapping the left edge but sitting mostly outside it. Membership by
    // overlap would adopt this; membership by centre reports what it looks
    // like, which is a shape beside the frame.
    expect(frameForShape(rect('a', -15, 40), [f])).toBeNull();
    // The same shape nudged in far enough for its middle to cross.
    expect(frameForShape(rect('a', -5, 40), [f])).toBe('f1');
  });

  it('gives an overlap to the frame drawn last', () => {
    const under = frame({ id: 'under' });
    const over = frame({ id: 'over', x: 50, y: 0 });

    // In both frames' bounds. The one on top is the one that looks like it is
    // holding it.
    expect(frameForShape(rect('a', 100, 40), [under, over])).toBe('over');
  });

  it('puts a frame inside the frame it is standing in', () => {
    const outer = frame({ id: 'outer', x: 0, y: 0, width: 400, height: 400 });
    const inner = frame({ id: 'inner', x: 50, y: 50, width: 100, height: 100 });

    expect(frameForShape(inner, [outer])).toBe('outer');
  });

  it('never makes a frame a member of a smaller one drawn inside it', () => {
    const outer = frame({ id: 'outer', x: 0, y: 0, width: 400, height: 400 });
    // Small, and over the outer frame's centre — which is where you would
    // naturally draw one.
    const inner = frame({ id: 'inner', x: 150, y: 150, width: 100, height: 100 });

    // The centre rule would answer 'inner' here, because the outer frame's
    // middle is inside it. The outer would then be clipped to the inner's
    // bounds and its border would vanish, leaving a board of bare labels.
    expect(frameForShape(outer, [inner])).toBeNull();
    expect(frameForShape(inner, [outer])).toBe('outer');
  });

  it('refuses to put a frame inside its own contents', () => {
    // Two frames on the same spot each hold the other's centre, so geometry
    // alone would have them claim each other — and every walk over the result
    // would then run until the stack gave out.
    const outer = frame({ id: 'outer', x: 0, y: 0, width: 200, height: 200 });
    const inner = {
      ...frame({ id: 'inner', x: 0, y: 0, width: 200, height: 200 }),
      frameId: 'outer',
    };

    expect(frameForShape(outer, [outer, inner])).toBeNull();
    // And never inside itself, however the frames are ordered.
    expect(frameForShape(outer, [outer])).toBeNull();
  });

  it('reports only the shapes whose frame actually changed', () => {
    const f = frame();
    const staying = { ...rect('staying', 90, 40), frameId: 'f1' };
    const joining = rect('joining', 20, 20);
    const leaving = { ...rect('leaving', 900, 900), frameId: 'f1' };
    const shapes = [f, staying, joining, leaving];

    const changes = membershipChanges([staying, joining, leaving], shapes);

    // `staying` is absent: writing a no-op for it would be a message per
    // shape per drop on a shared board, for nothing.
    expect(changes).toEqual([
      { id: 'joining', frameId: 'f1' },
      { id: 'leaving', frameId: null },
    ]);
  });

  it('releases members when the last frame is gone', () => {
    const orphan = { ...rect('orphan', 10, 10), frameId: 'deleted-frame' };

    expect(membershipChanges([orphan], [orphan])).toEqual([{ id: 'orphan', frameId: null }]);
  });

  it('treats a shape written before frames existed as loose', () => {
    const f = frame();
    // No `frameId` key at all, which is what every older shape says.
    const old = rect('old', 900, 900);

    expect(membershipChanges([old], [f, old])).toEqual([]);
  });

  it('finds a frame and its members', () => {
    const f = frame();
    const inside = { ...rect('in', 90, 40), frameId: 'f1' };
    const outside = rect('out', 900, 900);
    const shapes = [f, inside, outside];

    expect(framesIn(shapes)).toEqual([f]);
    expect(membersOf('f1', shapes).map((s) => s.id)).toEqual(['in']);
  });
});

describe('nesting', () => {
  /** outer ⊃ inner ⊃ leaf, plus a shape directly in the outer. */
  function nest() {
    const outer = frame({ id: 'outer', x: 0, y: 0, width: 400, height: 400 });
    const inner = {
      ...frame({ id: 'inner', x: 20, y: 20, width: 200, height: 200 }),
      frameId: 'outer',
    };
    const leaf = { ...rect('leaf', 40, 40), frameId: 'inner' };
    const direct = { ...rect('direct', 300, 300), frameId: 'outer' };
    return { outer, inner, leaf, direct, shapes: [outer, inner, leaf, direct] };
  }

  it('reaches all the way down for everything in a frame', () => {
    const { outer, shapes } = nest();

    // Moving or deleting the outer has to take the inner's own contents too,
    // or they are left behind holding nothing.
    expect(
      descendantsOf('outer', shapes)
        .map((s) => s.id)
        .sort(),
    ).toEqual(['direct', 'inner', 'leaf']);
    expect(frameWithMembers(outer, shapes)).toHaveLength(4);
  });

  it('reports the chain a shape is standing in, innermost first', () => {
    const { leaf, shapes } = nest();

    expect(frameChain(leaf, frameIndex(framesIn(shapes))).map((f) => f.id)).toEqual([
      'inner',
      'outer',
    ]);
  });

  it('does not hang on a document that describes a loop', () => {
    // Not reachable through the editor, but a merge, an older client or a
    // hand edit can write one, and the renderer walks this every frame.
    const a = { ...frame({ id: 'a' }), frameId: 'b' };
    const b = { ...frame({ id: 'b' }), frameId: 'a' };
    const byId = frameIndex([a, b]);

    expect(frameChain(a, byId).map((f) => f.id)).toEqual(['b']);
    expect(descendantsOf('a', [a, b]).map((s) => s.id)).toEqual(['b']);
  });

  it('lets an inner frame leave without disturbing what it holds', () => {
    const { inner, leaf, shapes } = nest();
    // Dragged clean out of the outer frame.
    const moved = { ...inner, x: 900, y: 900 };
    const next = shapes.map((s) => (s.id === 'inner' ? moved : s));

    expect(frameForShape(moved, framesIn(next))).toBeNull();
    // The leaf came along and is still the inner frame's.
    expect(membersOf('inner', next).map((s) => s.id)).toEqual([leaf.id]);
  });
});

describe('membership after a frame is resized', () => {
  it('takes in a shape the frame has been grown around', () => {
    // Grown to swallow a rectangle sitting at 300,20 that was on open board.
    const grown = frame({ width: 400 });
    const bystander = rect('a', 300, 20);

    expect(membershipAfterResize(grown, [grown, bystander])).toEqual([{ id: 'a', frameId: 'f1' }]);
  });

  it('lets go of a member the frame has been pulled in past', () => {
    const shrunk = frame({ width: 50 });
    const stranded = { ...rect('a', 150, 20), frameId: 'f1' };

    // Left behind entirely. Keeping it would go on cropping it to nothing
    // while still moving and deleting it as the frame's own.
    expect(membershipAfterResize(shrunk, [shrunk, stranded])).toEqual([{ id: 'a', frameId: null }]);
  });

  it('keeps a member the edge has only cut across', () => {
    const shrunk = frame({ width: 100 });
    // Straddling the new right edge at x=100: from 90 to 110.
    const straddling = { ...rect('a', 90, 20), frameId: 'f1' };

    // The two thresholds are what make the edge sticky. One boundary would
    // flip this shape in and out as the handle crossed it, and every flip is
    // a write on a shared board.
    expect(membershipAfterResize(shrunk, [shrunk, straddling])).toEqual([]);
  });

  it('does not take in a shape only partly swept over', () => {
    const grown = frame({ width: 100 });
    // Straddling the edge, but loose rather than already a member.
    const straddling = rect('a', 90, 20);

    // The other half of the sticky edge: half-in is not enough to join.
    expect(membershipAfterResize(grown, [grown, straddling])).toEqual([]);
  });

  it('takes in a whole frame it has been grown around, contents and all', () => {
    const grown = frame({ id: 'grown', width: 400 });
    const other = frame({ id: 'other', x: 300, y: 0, width: 80, height: 60 });
    const spokenFor = { ...rect('a', 310, 20), frameId: 'other' };

    // The inner frame joins; what is standing in it stays with it rather than
    // being claimed directly, so the nesting stays one level deep per step.
    expect(membershipAfterResize(grown, [grown, other, spokenFor])).toEqual([
      { id: 'other', frameId: 'grown' },
    ]);
  });

  it('refuses to become a member of its own contents', () => {
    const outer = frame({ id: 'outer', x: 0, y: 0, width: 200, height: 200 });
    const inner = {
      ...frame({ id: 'inner', x: 0, y: 0, width: 200, height: 200 }),
      frameId: 'outer',
    };

    // `outer` grown to exactly cover `inner` would otherwise swallow the very
    // frame that is standing in it.
    expect(membershipAfterResize(outer, [outer, inner])).toEqual([]);
  });

  it('says nothing when the resize changed no answers', () => {
    const f = frame();
    const inside = { ...rect('in', 40, 40), frameId: 'f1' };
    const outside = rect('out', 900, 900);

    expect(membershipAfterResize(f, [f, inside, outside])).toEqual([]);
  });
});

describe('frame hit region', () => {
  it('answers on the border but not in the middle', () => {
    const f = frame();

    expect(frameHitAt(f, 0, 50, 1)).toBe(true);
    expect(frameHitAt(f, 200, 50, 1)).toBe(true);
    expect(frameHitAt(f, 100, 0, 1)).toBe(true);
    // The hollow middle, which is the whole point: a frame is mostly space
    // other people's work stands in.
    expect(frameHitAt(f, 100, 50, 1)).toBe(false);
  });

  it('answers on the label above the top edge', () => {
    const f = frame();
    const label = frameLabelBounds(f, 1);

    expect(label.y).toBeLessThan(f.y);
    expect(frameHitAt(f, f.x + 2, label.y + label.height / 2, 1)).toBe(true);
    // Past the end of the text, still above the frame — that is board.
    expect(frameHitAt(f, f.x + f.width - 2, label.y + 1, 1)).toBe(false);
  });

  it('keeps the border grabbable as the board zooms out', () => {
    const f = frame();

    // 4 world units outside the edge. At 1:1 that is beyond the band; zoomed
    // out it is under a pixel away on screen, so it has to count.
    expect(frameHitAt(f, -4, 50, 1)).toBe(true);
    expect(frameHitAt(f, -4, 50, 4)).toBe(false);
    expect(frameHitAt(f, -20, 50, 0.25)).toBe(true);
  });

  it('lets a click in the middle reach the shape standing there', () => {
    const f = frame();
    const inside = { ...rect('in', 90, 40), frameId: 'f1' };
    const shapes = [f, inside];
    const index = new SpatialIndex();
    index.rebuild(shapes);

    // The frame is below the rectangle, but even the empty part of it must
    // not answer — otherwise every click meant for the board grabs it.
    expect(hitTest(shapes, index, 95, 45, 1)?.id).toBe('in');
    expect(hitTest(shapes, index, 150, 80, 1)).toBeNull();
    expect(hitTest(shapes, index, 0, 50, 1)?.id).toBe('f1');
  });
});

describe('frame label targeting', () => {
  it('finds the frame whose name is under the point', () => {
    const f = frame({ name: 'Handoff' });
    const label = frameLabelBounds(f, 1);

    expect(frameLabelAt([f], f.x + 2, label.y + label.height / 2, 1)?.id).toBe('f1');
  });

  it('does not answer for the border, only the name', () => {
    const f = frame();

    // Renaming is aimed at the label. Double-clicking an edge must not open
    // it for editing, even though the edge does select the frame.
    expect(frameHitAt(f, 0, 50, 1)).toBe(true);
    expect(frameLabelAt([f], 0, 50, 1)).toBeNull();
  });

  it('gives an overlap to the topmost label', () => {
    const under = frame({ id: 'under' });
    const over = frame({ id: 'over' });
    const label = frameLabelBounds(over, 1);

    expect(frameLabelAt([under, over], 2, label.y + label.height / 2, 1)?.id).toBe('over');
  });
});

describe('erasing a frame', () => {
  it('rubs out what is inside without taking the frame', () => {
    const f = frame();

    // A stroke straight through the middle. Treating the interior as solid
    // would delete the container out from under its contents.
    expect(
      segmentErasesShape(
        [
          [80, 50],
          [120, 50],
        ],
        f,
        1,
      ),
    ).toBe(false);
  });

  it('takes the frame when the stroke crosses its border', () => {
    const f = frame();

    expect(
      segmentErasesShape(
        [
          [-10, 50],
          [10, 50],
        ],
        f,
        1,
      ),
    ).toBe(true);
  });
});

describe('frame serialization', () => {
  it('survives a round trip through the document', () => {
    const original = frame({ name: 'Sprint board' });
    const restored = yMapToShape(integrate(shapeToYMap(original)));

    expect(restored).toMatchObject({
      kind: 'frame',
      id: 'f1',
      width: 200,
      height: 100,
      name: 'Sprint board',
    });
  });

  it('carries membership, and writes no key for a loose shape', () => {
    const member = { ...rect('m', 10, 10), frameId: 'f1' };
    expect(yMapToShape(integrate(shapeToYMap(member)))?.frameId).toBe('f1');

    const loose = integrate(shapeToYMap(rect('l', 10, 10)));
    expect(loose.has('frameId')).toBe(false);
    expect(yMapToShape(loose)?.frameId).toBeUndefined();
  });

  it('coerces a name that is not a string', () => {
    // The same class of bad value that took a board down when it appeared in
    // a text shape: a Y.Text where a plain string belongs.
    const map = integrate(shapeToYMap(frame()));
    map.set('name', new Y.Text('written by an older writer'));

    expect(typeof (yMapToShape(map) as FrameShape).name).toBe('string');
  });
});

describe('frame rendering', () => {
  function paint(shapes: readonly Shape[]) {
    const canvas = new OffscreenCanvas(300, 200);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    renderStaticScene(ctx, canvas, { width: 300, height: 200, shapes });
    return ctx.getImageData(0, 0, 300, 200).data;
  }

  function paintedAt(pixels: Uint8ClampedArray, x: number, y: number): boolean {
    return pixels[(y * 300 + x) * 4 + 3]! > 0;
  }

  it('crops a member at the frame edge', () => {
    const f = frame({ x: 20, y: 20, width: 100, height: 100 });
    // Sticking out well past the frame's right edge.
    // Solid and crisp so a pixel probe is meaningful: the default hachure
    // fill is sparse lines, and a point can fall between them.
    const member = {
      ...createRectangle({
        id: 'm',
        x: 60,
        y: 50,
        width: 150,
        height: 30,
        fillColor: '#ff0000',
        fillStyle: 'solid',
        roughness: 0,
      }),
      frameId: 'f1',
    };

    const pixels = paint([f, member]);

    expect(paintedAt(pixels, 100, 60)).toBe(true);
    // Past the frame's right edge at x=120, where the member would still be
    // drawn if nothing cropped it.
    expect(paintedAt(pixels, 160, 60)).toBe(false);
  });

  it('leaves a shape that is not a member alone', () => {
    const f = frame({ x: 20, y: 20, width: 100, height: 100 });
    const loose = createRectangle({
      id: 'm',
      x: 60,
      y: 50,
      width: 150,
      height: 30,
      fillColor: '#ff0000',
      fillStyle: 'solid',
      roughness: 0,
    });

    expect(paintedAt(paint([f, loose]), 160, 60)).toBe(true);
  });

  it('crops a nested member against every frame holding it', () => {
    // The inner frame hangs off the right of the outer: it runs to x=200,
    // where the outer stops at 120.
    const outer = frame({ id: 'outer', x: 20, y: 20, width: 100, height: 100 });
    const inner = {
      ...frame({ id: 'inner', x: 40, y: 40, width: 160, height: 60 }),
      frameId: 'outer',
    };
    const leaf = {
      ...createRectangle({
        id: 'leaf',
        x: 50,
        y: 50,
        width: 140,
        height: 30,
        fillColor: '#ff0000',
        fillStyle: 'solid',
        roughness: 0,
      }),
      frameId: 'inner',
    };

    const pixels = paint([outer, inner, leaf]);

    expect(paintedAt(pixels, 100, 60)).toBe(true);
    // Inside the inner frame but past the outer's right edge. Clipping only
    // against the immediate frame would leave this painted outside the frame
    // that is supposed to contain the whole arrangement.
    expect(paintedAt(pixels, 150, 60)).toBe(false);
  });

  it('crops members in an export too', () => {
    const f = frame({ x: 20, y: 20, width: 100, height: 100 });
    const member = { ...rect('m', 60, 50), frameId: 'f1' };

    const svg = renderSceneToSvgString([f, member]);

    expect(svg).toContain('<clipPath id="cf-frame-clip-f1">');
    expect(svg).toContain('clip-path="url(#cf-frame-clip-f1)"');
  });

  it('leaves out the label of a frame being renamed', () => {
    const f = frame({ x: 40, y: 40, width: 100, height: 60, name: 'Handoff' });

    function labelPixels(hidden?: ReadonlySet<string>): number {
      const canvas = new OffscreenCanvas(300, 200);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      renderStaticScene(ctx, canvas, {
        width: 300,
        height: 200,
        shapes: [f],
        editingFrameIds: hidden,
      });
      // The band above the frame's top edge, where only the label is drawn.
      const data = ctx.getImageData(40, f.y - 18, 100, 17).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted++;
      return painted;
    }

    // Otherwise the painted name shows through whatever is typed into the
    // input the editor puts over it.
    expect(labelPixels()).toBeGreaterThan(0);
    expect(labelPixels(new Set(['f1']))).toBe(0);
  });

  it('holds the border to one weight on screen as the board zooms', () => {
    const f = frame({ x: 20, y: 20, width: 100, height: 60 });

    function borderThickness(zoom: number): number {
      const canvas = new OffscreenCanvas(300, 200);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      renderStaticScene(ctx, canvas, {
        width: 300,
        height: 200,
        shapes: [f],
        // Centred on the frame's left edge so it stays on canvas at any zoom.
        camera: { x: 20 - 40 / zoom, y: 20 + 30 - 50 / zoom, zoom },
      });
      // The camera pins the frame's left edge to screen x=40 at every zoom, so
      // scan only around it — at 3x the right edge is off canvas, and counting
      // the whole row would measure how many borders are visible rather than
      // how thick one is.
      const data = ctx.getImageData(0, 0, 300, 200).data;
      let thickness = 0;
      for (let x = 30; x < 55; x++) {
        if (data[(50 * 300 + x) * 4 + 3]! > 128) thickness++;
      }
      return thickness;
    }

    // The border was drawn in world units, so at 3x it painted a six-pixel
    // slab and the container started competing with the work inside it.
    expect(borderThickness(3)).toBe(borderThickness(1));
  });

  it('draws the border in the selection colour while the name is being edited', () => {
    const f = frame({ x: 20, y: 20, width: 100, height: 60 });

    function borderColour(editing?: ReadonlySet<string>): string {
      const canvas = new OffscreenCanvas(300, 200);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      renderStaticScene(ctx, canvas, {
        width: 300,
        height: 200,
        shapes: [f],
        editingFrameIds: editing,
      });
      // On the left border, halfway down.
      const [r, g, b] = ctx.getImageData(20, 50, 1, 1).data;
      return `${r},${g},${b}`;
    }

    // The selection outline is drawn padded away from the shape, so it reads
    // as a box around the frame rather than as this frame being active.
    expect(borderColour()).not.toBe(borderColour(new Set(['f1'])));
  });

  it('names the frame in an export', () => {
    expect(renderSceneToSvgString([frame({ name: 'Handoff' })])).toContain('>Handoff</text>');
  });

  it('falls back to a default name when it has none', () => {
    expect(renderSceneToSvgString([frame()])).toContain('>Frame</text>');
  });
});
