import { describe, expect, it } from 'vitest';
import { recogniseStroke } from '../src/sketch/recognise-stroke';
import type { Vec2 } from '../src/geometry/segment';

/**
 * Strokes a hand would actually produce.
 *
 * Every generator walks its ideal path at a fixed number of samples and adds
 * wobble, because a recogniser that only works on clean input is not one.
 * The wobble comes from a seeded generator so a failure here is always the
 * same failure.
 */
function wobbler(seed: number, amount: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return ((state / 4294967296) * 2 - 1) * amount;
  };
}

/** Walk `path` — a function of t in [0, 1] — at `count` samples, with wobble. */
function trace(
  count: number,
  path: (t: number) => Vec2,
  { wobble = 0, seed = 1 }: { wobble?: number; seed?: number } = {},
): Vec2[] {
  const noise = wobbler(seed, wobble);
  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const [x, y] = path(i / (count - 1));
    points.push([x + noise(), y + noise()]);
  }
  return points;
}

/** Walk the perimeter of a polygon given its corners, closing back to the first. */
function polygon(corners: readonly Vec2[]) {
  const loop = [...corners, corners[0]!];
  const sides = loop.length - 1;
  return (t: number): Vec2 => {
    const scaled = Math.min(t, 0.9999) * sides;
    const side = Math.floor(scaled);
    const along = scaled - side;
    const [ax, ay] = loop[side]!;
    const [bx, by] = loop[side + 1]!;
    return [ax + along * (bx - ax), ay + along * (by - ay)];
  };
}

function rectangle(x: number, y: number, w: number, h: number) {
  return polygon([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);
}

function diamond(x: number, y: number, w: number, h: number) {
  return polygon([
    [x + w / 2, y],
    [x + w, y + h / 2],
    [x + w / 2, y + h],
    [x, y + h / 2],
  ]);
}

function ellipse(cx: number, cy: number, rx: number, ry: number) {
  return (t: number): Vec2 => [
    cx + rx * Math.cos(t * Math.PI * 2),
    cy + ry * Math.sin(t * Math.PI * 2),
  ];
}

function segment(from: Vec2, to: Vec2) {
  return (t: number): Vec2 => [from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1])];
}

/**
 * A shaft drawn left to right, then a two-stroke head at the far end — the way
 * an arrow is actually drawn, in one gesture without lifting.
 */
function arrow(from: Vec2, to: Vec2, headSize = 22): Vec2[] {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const barb = (spread: number): Vec2 => [
    to[0] - headSize * Math.cos(angle - spread),
    to[1] - headSize * Math.sin(angle - spread),
  ];
  return [
    ...trace(40, segment(from, to), { wobble: 1.5, seed: 7 }),
    ...trace(6, segment(to, barb(0.5)), { wobble: 1, seed: 11 }),
    ...trace(6, segment(barb(0.5), to), { wobble: 1, seed: 13 }),
    ...trace(6, segment(to, barb(-0.5)), { wobble: 1, seed: 17 }),
  ];
}

function rotate(points: readonly Vec2[], radians: number, about: Vec2 = [0, 0]): Vec2[] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map(([x, y]) => {
    const dx = x - about[0];
    const dy = y - about[1];
    return [about[0] + dx * cos - dy * sin, about[1] + dx * sin + dy * cos] as Vec2;
  });
}

const kindOf = (points: readonly Vec2[], zoom = 1) => recogniseStroke(points, zoom)?.kind ?? null;

describe('recogniseStroke', () => {
  describe('outlines', () => {
    it('reads a hand-drawn rectangle', () => {
      expect(kindOf(trace(90, rectangle(0, 0, 200, 120), { wobble: 4 }))).toBe('rectangle');
    });

    it('reads a hand-drawn square', () => {
      expect(kindOf(trace(90, rectangle(0, 0, 150, 150), { wobble: 4, seed: 3 }))).toBe(
        'rectangle',
      );
    });

    it('reads a hand-drawn ellipse', () => {
      expect(kindOf(trace(90, ellipse(0, 0, 120, 70), { wobble: 4 }))).toBe('ellipse');
    });

    it('reads a hand-drawn circle', () => {
      expect(kindOf(trace(90, ellipse(0, 0, 90, 90), { wobble: 4, seed: 5 }))).toBe('ellipse');
    });

    it('reads a hand-drawn diamond', () => {
      expect(kindOf(trace(90, diamond(0, 0, 180, 140), { wobble: 4 }))).toBe('diamond');
    });

    it('tells a tapered, bucket-shaped rectangle from an ellipse', () => {
      // Its hull fills about as much of its box as an ellipse does, so only
      // the corners tell them apart.
      const bucket = polygon([
        [20, 0],
        [180, 0],
        [200, 140],
        [0, 140],
      ]);
      expect(kindOf(trace(90, bucket, { wobble: 3 }))).toBe('rectangle');
    });

    it('reads a rectangle whose corners were rounded off by the pen', () => {
      const rounded = (t: number): Vec2 => {
        const [x, y] = rectangle(0, 0, 200, 120)(t);
        // Pull each corner in toward the centre of the box.
        const pull = (v: number, min: number, max: number) =>
          v < min + 14
            ? v + (14 - (v - min)) * 0.28
            : v > max - 14
              ? v - (14 - (max - v)) * 0.28
              : v;
        return [pull(x, 0, 200), pull(y, 0, 120)];
      };
      expect(kindOf(trace(90, rounded, { wobble: 3 }))).toBe('rectangle');
    });

    it('reads an outline the hand did not quite close', () => {
      // Stops 8% short of the start, which is inside the closure tolerance.
      const short = (t: number) => ellipse(0, 0, 100, 100)(t * 0.94);
      expect(kindOf(trace(90, short, { wobble: 3 }))).toBe('ellipse');
    });

    it('reads an outline the hand overshot', () => {
      const over = (t: number) => ellipse(0, 0, 100, 100)(t * 1.05);
      expect(kindOf(trace(90, over, { wobble: 3 }))).toBe('ellipse');
    });

    it('still reads an oval drawn fatter at one end as an ellipse', () => {
      // The lopsidedness gate exists to catch triangles, and has to leave a
      // merely uneven hand alone.
      const egg = (t: number): Vec2 => {
        const [x, y] = ellipse(0, 0, 100, 70)(t);
        return [x, y * (1 + 0.28 * Math.sign(y))];
      };
      expect(kindOf(trace(90, egg, { wobble: 3 }))).toBe('ellipse');
    });

    it('reads a rectangle whose four sides all disagree', () => {
      const sloppy: Vec2[][] = [
        [
          [0, 8],
          [190, 0],
          [200, 132],
          [12, 140],
        ],
        [
          [40, 0],
          [170, 6],
          [200, 140],
          [0, 132],
        ],
        [
          [40, 0],
          [220, 0],
          [180, 130],
          [0, 130],
        ],
        [
          [0, 0],
          [200, 20],
          [190, 150],
          [20, 120],
        ],
      ];
      for (const corners of sloppy) {
        expect(kindOf(trace(90, polygon(corners), { wobble: 4 }))).toBe('rectangle');
      }
    });
  });

  describe('straight strokes', () => {
    it('reads a line', () => {
      expect(kindOf(trace(40, segment([0, 0], [220, 60]), { wobble: 2 }))).toBe('line');
    });

    it('reads a line drawn in any direction', () => {
      for (const to of [
        [220, 0],
        [0, 220],
        [-220, 0],
        [0, -220],
        [-160, -160],
      ] as Vec2[]) {
        expect(kindOf(trace(40, segment([0, 0], to), { wobble: 2 }))).toBe('line');
      }
    });

    it('still reads a lazily bowed line as a line', () => {
      const bowed = (t: number): Vec2 => [t * 240, Math.sin(t * Math.PI) * 20];
      expect(kindOf(trace(40, bowed, { wobble: 2 }))).toBe('line');
    });

    it('reads an arrow by the samples its head piles up at one end', () => {
      expect(kindOf(arrow([0, 0], [240, 0]))).toBe('arrow');
    });

    it('reads an arrow drawn in any direction', () => {
      for (const to of [
        [0, 240],
        [-240, 0],
        [0, -240],
        [170, 170],
      ] as Vec2[]) {
        expect(kindOf(arrow([0, 0], to))).toBe('arrow');
      }
    });

    it('points the arrow at the tip rather than at the last point of the head', () => {
      const verdict = recogniseStroke(arrow([0, 0], [240, 0]));
      expect(verdict?.kind).toBe('arrow');
      if (verdict?.kind !== 'arrow') throw new Error('expected an arrow');

      expect(verdict.from[0]).toBeCloseTo(0, -1);
      expect(verdict.to[0]).toBeGreaterThan(230);
      expect(Math.abs(verdict.to[1])).toBeLessThan(12);
    });

    it('keeps a line pointing the way it was drawn', () => {
      const verdict = recogniseStroke(trace(40, segment([300, 200], [100, 40]), { wobble: 1 }));
      if (verdict?.kind !== 'line') throw new Error('expected a line');

      expect(verdict.from[0]).toBeGreaterThan(verdict.to[0]);
      expect(verdict.from[1]).toBeGreaterThan(verdict.to[1]);
    });
  });

  describe('strokes it should leave alone', () => {
    it('refuses a sharp elbow', () => {
      const elbow = polygon([
        [0, 0],
        [150, 0],
        [150, 150],
      ]);
      // Only the two legs, not the closing side.
      expect(kindOf(trace(60, (t) => elbow(t * 0.667), { wobble: 2 }))).toBeNull();
    });

    it('refuses a zigzag', () => {
      const zigzag = (t: number): Vec2 => [t * 240, (Math.floor(t * 6) % 2 === 0 ? 1 : -1) * 40];
      expect(kindOf(trace(60, zigzag, { wobble: 2 }))).toBeNull();
    });

    it('refuses a wide arc', () => {
      const arc = (t: number) => ellipse(0, 0, 120, 120)(t * 0.4);
      expect(kindOf(trace(50, arc, { wobble: 2 }))).toBeNull();
    });

    it('refuses a scribble', () => {
      const scribble = (t: number): Vec2 => [
        Math.cos(t * 17) * 90 + Math.sin(t * 6) * 40,
        Math.sin(t * 23) * 80 + Math.cos(t * 4) * 50,
      ];
      expect(kindOf(trace(120, scribble, { wobble: 3 }))).toBeNull();
    });

    it('refuses a triangle, which is not a shape this draws', () => {
      // Every other measurement reads a triangle as a diamond: it fills half
      // its box and spreads its samples along both axes just as one does.
      // Only its lopsidedness gives it away, so this is the one family that
      // has to hold over a range of proportions and a range of hands.
      const triangles: Vec2[][] = [
        [
          [0, 0],
          [180, 0],
          [90, 150],
        ], // isoceles
        [
          [100, 0],
          [200, 173],
          [0, 173],
        ], // equilateral
        [
          [0, 0],
          [180, 0],
          [0, 150],
        ], // right
        [
          [0, 0],
          [240, 0],
          [200, 70],
        ], // obtuse
        [
          [0, 0],
          [260, 0],
          [130, 90],
        ], // wide
        [
          [0, 0],
          [240, 10],
          [120, 40],
        ], // sliver
      ];
      for (const corners of triangles) {
        for (const wobble of [1, 3, 5]) {
          expect(kindOf(trace(90, polygon(corners), { wobble, seed: 41 }))).toBeNull();
        }
      }
    });

    it('refuses a stroke of fewer than three points', () => {
      expect(
        recogniseStroke([
          [0, 0],
          [100, 100],
        ]),
      ).toBeNull();
    });
  });

  describe('what it is and is not invariant to', () => {
    it('reads the same shape wherever it is drawn on the board', () => {
      const here = trace(90, rectangle(0, 0, 200, 120), { wobble: 4 });
      const there = here.map(([x, y]) => [x + 4200, y - 1800] as Vec2);
      expect(kindOf(there)).toBe('rectangle');
    });

    it('reads the same shape at any size', () => {
      for (const scale of [0.35, 1, 6]) {
        const scaled = trace(90, ellipse(0, 0, 120 * scale, 70 * scale), { wobble: 3 * scale });
        expect(kindOf(scaled)).toBe('ellipse');
      }
    });

    it('reads the same shape whichever way round the outline was drawn', () => {
      const clockwise = trace(90, diamond(0, 0, 180, 140), { wobble: 4 });
      expect(kindOf([...clockwise].reverse())).toBe('diamond');
    });

    it('reads the same shape wherever on the outline the pen started', () => {
      const loop = trace(90, rectangle(0, 0, 200, 120), { wobble: 4 });
      for (const offset of [20, 45, 70]) {
        const rolled = [...loop.slice(offset), ...loop.slice(0, offset)];
        expect(kindOf(rolled)).toBe('rectangle');
      }
    });

    it('reads an ellipse at any angle, since it has no corners to give it away', () => {
      const tilted = rotate(trace(90, ellipse(0, 0, 130, 70), { wobble: 3 }), Math.PI / 5);
      expect(kindOf(tilted)).toBe('ellipse');
    });

    it('reads a square turned by 45 degrees as the diamond it now looks like', () => {
      // Deliberately not rotation invariant: on a board, a shape is what it
      // looks like, and a square on its corner is a diamond.
      const turned = rotate(trace(90, rectangle(-75, -75, 150, 150), { wobble: 3 }), Math.PI / 4);
      expect(kindOf(turned)).toBe('diamond');
    });
  });

  describe('the size gate', () => {
    it('leaves a stroke too small to be meant as a shape alone', () => {
      expect(kindOf(trace(40, rectangle(0, 0, 18, 12), { wobble: 0.5 }))).toBeNull();
    });

    it('judges size as it appears, so zooming out raises the bar', () => {
      const small = trace(90, rectangle(0, 0, 40, 30), { wobble: 1 });
      expect(kindOf(small, 1)).toBe('rectangle');
      expect(kindOf(small, 0.25)).toBeNull();
    });

    it('judges size as it appears, so zooming in lowers it', () => {
      const tiny = trace(90, rectangle(0, 0, 14, 10), { wobble: 0.4 });
      expect(kindOf(tiny, 1)).toBeNull();
      expect(kindOf(tiny, 4)).toBe('rectangle');
    });
  });

  describe('over many hands', () => {
    // One steady stroke proving a shape works says little, since every
    // threshold here was chosen against a spread. These sweep the wobble from
    // a drafting hand to a careless one, over enough seeds that a threshold
    // set a little too fine would show up.
    const hands = (path: (t: number) => Vec2, count = 90) => {
      const strokes: Vec2[][] = [];
      for (let seed = 1; seed <= 12; seed++) {
        for (const wobble of [1, 3, 5]) {
          strokes.push(trace(count, path, { wobble, seed: seed * 7919 }));
        }
      }
      return strokes;
    };

    const families = [
      ['rectangle', rectangle(0, 0, 200, 120)],
      ['rectangle', rectangle(0, 0, 150, 150)],
      ['rectangle', rectangle(0, 0, 260, 70)],
      ['ellipse', ellipse(0, 0, 120, 70)],
      ['ellipse', ellipse(0, 0, 90, 90)],
      ['ellipse', ellipse(0, 0, 140, 45)],
      ['diamond', diamond(0, 0, 180, 140)],
      ['diamond', diamond(0, 0, 130, 130)],
    ] as const;

    it.each(families)('reads a %s of its proportions from any hand', (kind, path) => {
      for (const stroke of hands(path)) {
        expect(kindOf(stroke)).toBe(kind);
      }
    });

    it('reads a line from any hand', () => {
      for (const stroke of hands(segment([0, 0], [220, 60]), 40)) {
        expect(kindOf(stroke)).toBe('line');
      }
    });

    it('reads an arrow from any hand', () => {
      for (let seed = 1; seed <= 12; seed++) {
        const angle = (seed / 12) * Math.PI * 2;
        const to: Vec2 = [Math.cos(angle) * 240, Math.sin(angle) * 240];
        expect(kindOf(arrow([0, 0], to))).toBe('arrow');
      }
    });
  });

  describe('the box it hands back', () => {
    it('spans exactly the stroke that was drawn, wobble included', () => {
      const points = trace(90, rectangle(50, 30, 200, 120), { wobble: 3 });
      const verdict = recogniseStroke(points);
      if (verdict?.kind !== 'rectangle') throw new Error('expected a rectangle');

      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      expect(verdict.bounds.x).toBeCloseTo(Math.min(...xs), 6);
      expect(verdict.bounds.y).toBeCloseTo(Math.min(...ys), 6);
      expect(verdict.bounds.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 6);
      expect(verdict.bounds.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 6);
    });
  });
});
