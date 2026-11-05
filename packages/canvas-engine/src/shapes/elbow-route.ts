import type { Point, Rect } from '../math.js';

/**
 * A direction along one axis: the way a line leaves a shape's side, or the
 * way it is travelling. Exactly one of the two is non-zero.
 */
export interface Heading {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
}

export const HEADING_RIGHT: Heading = { x: 1, y: 0 };
export const HEADING_LEFT: Heading = { x: -1, y: 0 };
export const HEADING_DOWN: Heading = { x: 0, y: 1 };
export const HEADING_UP: Heading = { x: 0, y: -1 };

/**
 * One end of an elbow route.
 *
 * Attached to a shape, `outward` is the way its side faces and `box` the room
 * the shape takes: the line leaves (or comes in) square to that side and goes
 * round the box rather than through it. A free end has neither, and the route
 * works out which way to come in from where the other end is.
 */
export interface ElbowEnd {
  readonly point: Point;
  readonly outward: Heading | null;
  readonly box: Rect | null;
}

/** How far a route stands off the shapes it goes round, in world units. */
export const ELBOW_PADDING = 24;

/**
 * The cost of a bend, over and above the length it adds. A bend costs about
 * as much as a detour of this many units, so a route goes a little further to
 * turn fewer times, but does not wander off the board to save one.
 */
const BEND_COST = 48;

const sameHeading = (a: Heading, b: Heading) => a.x === b.x && a.y === b.y;
const opposite = (a: Heading): Heading => ({ x: -a.x as Heading['x'], y: -a.y as Heading['y'] });

/**
 * The axis a free end most nearly lies along from `from`, travelling towards
 * it. Level wins a tie, so a pointer swung through forty-five degrees does not
 * flicker between the two.
 */
export function dominantHeading(from: Point, to: Point): Heading {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + 1 >= Math.abs(dy)) return dx < 0 ? HEADING_LEFT : HEADING_RIGHT;
  return dy < 0 ? HEADING_UP : HEADING_DOWN;
}

function padded(box: Rect, pad: number): Rect {
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

/** Strictly inside: a route may run along the edge of a padded box, never through it. */
function strictlyInside(point: Point, box: Rect): boolean {
  const e = 1e-6;
  return (
    point.x > box.x + e &&
    point.x < box.x + box.width - e &&
    point.y > box.y + e &&
    point.y < box.y + box.height - e
  );
}

/**
 * Where a line leaving `end` first stands clear of its shape: straight out of
 * the side, past the edge of the shape's box by the padding.
 */
function dongleOf(end: ElbowEnd, pad: number): Point {
  const { point, outward, box } = end;
  if (!outward) return point;
  if (!box) return { x: point.x + outward.x * pad, y: point.y + outward.y * pad };
  if (outward.x > 0) return { x: Math.max(point.x, box.x + box.width) + pad, y: point.y };
  if (outward.x < 0) return { x: Math.min(point.x, box.x) - pad, y: point.y };
  if (outward.y > 0) return { x: point.x, y: Math.max(point.y, box.y + box.height) + pad };
  return { x: point.x, y: Math.min(point.y, box.y) - pad };
}

/** A minimal binary heap of [cost, state] pairs. */
class Queue {
  private readonly items: Array<[number, number]> = [];

  get size(): number {
    return this.items.length;
  }

  push(cost: number, state: number): void {
    const items = this.items;
    items.push([cost, state]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]![0] <= cost) break;
      items[i] = items[parent]!;
      i = parent;
    }
    items[i] = [cost, state];
  }

  pop(): [number, number] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length === 0) return top;
    let i = 0;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = -1;
      let best = last[0];
      if (left < items.length && items[left]![0] < best) {
        smallest = left;
        best = items[left]![0];
      }
      if (right < items.length && items[right]![0] < best) smallest = right;
      if (smallest < 0) break;
      items[i] = items[smallest]!;
      i = smallest;
    }
    items[i] = last;
    return top;
  }
}

/** The four ways to travel, in the order the search indexes them. */
const HEADINGS: readonly Heading[] = [HEADING_RIGHT, HEADING_DOWN, HEADING_LEFT, HEADING_UP];
const headingIndex = (h: Heading) => HEADINGS.findIndex((each) => sameHeading(each, h));

/** Consecutive repeats and points in the middle of a straight run, taken out. */
function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    const before = out[out.length - 2];
    if (before && last) {
      const level = Math.abs(before.y - last.y) < 1e-6 && Math.abs(last.y - p.y) < 1e-6;
      const upright = Math.abs(before.x - last.x) < 1e-6 && Math.abs(last.x - p.x) < 1e-6;
      if (level || upright) out.pop();
    }
    out.push(p);
  }
  return out;
}

/**
 * A route of level and upright runs from `start` to `end`.
 *
 * Searched for over a sparse grid: the lines through the two ends, the points
 * where each leaves its shape, the padded edges of every box in the way, and
 * the lines half way between them. A route is cheapest when it is short and
 * turns rarely, and it never passes through a box — its own two shapes
 * included, which is what takes it round the back of a shape when the other
 * end is behind it.
 *
 * Returned as the whole polyline, both ends included, with every point a
 * corner.
 */
export function routeElbow(
  startEnd: ElbowEnd,
  endEnd: ElbowEnd,
  obstacles: readonly Rect[] = [],
  pad = ELBOW_PADDING,
): Point[] {
  const route =
    search(startEnd, endEnd, obstacles, pad) ??
    // Boxed in by what is in the way: go through it rather than not at all.
    search(startEnd, endEnd, [], pad);
  if (route) return route;
  // Ends inside each other's shapes leave nothing to search; one bend will do.
  const a = startEnd.point;
  const b = endEnd.point;
  return simplify([a, { x: b.x, y: a.y }, b]);
}

function search(
  startEnd: ElbowEnd,
  endEnd: ElbowEnd,
  obstacles: readonly Rect[],
  pad: number,
): Point[] | null {
  // A free end comes in along the axis it most nearly lies along from where
  // the other end leaves its shape, so a line drawn level stays level and one
  // pulled up or down turns to meet it.
  const startDongle = dongleOf(startEnd, pad);
  const endDongle = dongleOf(endEnd, pad);
  const leave: Heading = startEnd.outward ?? dominantHeading(startEnd.point, endDongle);
  const arrive: Heading = endEnd.outward
    ? opposite(endEnd.outward)
    : dominantHeading(startDongle, endEnd.point);

  const blocks: Rect[] = [];
  if (startEnd.box) blocks.push(padded(startEnd.box, pad));
  if (endEnd.box) blocks.push(padded(endEnd.box, pad));
  for (const box of obstacles) blocks.push(padded(box, pad));

  const xs = new Set<number>([startDongle.x, endDongle.x]);
  const ys = new Set<number>([startDongle.y, endDongle.y]);
  for (const b of blocks) {
    xs.add(b.x);
    xs.add(b.x + b.width);
    ys.add(b.y);
    ys.add(b.y + b.height);
  }
  // Half way between the two ends, and between the two shapes, is where a
  // route that has to cross over looks best doing it.
  xs.add((startDongle.x + endDongle.x) / 2);
  ys.add((startDongle.y + endDongle.y) / 2);
  const sb = startEnd.box && padded(startEnd.box, pad);
  const eb = endEnd.box && padded(endEnd.box, pad);
  if (sb && eb) {
    if (sb.x + sb.width < eb.x) xs.add((sb.x + sb.width + eb.x) / 2);
    if (eb.x + eb.width < sb.x) xs.add((eb.x + eb.width + sb.x) / 2);
    if (sb.y + sb.height < eb.y) ys.add((sb.y + sb.height + eb.y) / 2);
    if (eb.y + eb.height < sb.y) ys.add((eb.y + eb.height + sb.y) / 2);
  }

  const xList = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  const yList = [...ys].filter(Number.isFinite).sort((a, b) => a - b);
  const cols = xList.length;
  const rows = yList.length;
  const nodeAt = (col: number, row: number) => row * cols + col;
  const pointOf = (node: number): Point => ({
    x: xList[node % cols]!,
    y: yList[Math.floor(node / cols)]!,
  });

  const startNode = nodeAt(xList.indexOf(startDongle.x), yList.indexOf(startDongle.y));
  const endNode = nodeAt(xList.indexOf(endDongle.x), yList.indexOf(endDongle.y));

  const open = new Uint8Array(cols * rows);
  for (let node = 0; node < open.length; node += 1) {
    const p = pointOf(node);
    open[node] = blocks.some((b) => strictlyInside(p, b)) ? 0 : 1;
  }
  // The two ends stand where they stand, whatever is drawn over them.
  open[startNode] = 1;
  open[endNode] = 1;
  const free = (node: number) => open[node] === 1;
  const passable = (a: number, b: number) => {
    const pa = pointOf(a);
    const pb = pointOf(b);
    const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    return !blocks.some((box) => strictlyInside(mid, box));
  };

  // A tiny pull towards the middle of the route, so that of two routes alike
  // in length and bends the one that crosses over half way wins.
  const centre = { x: (startDongle.x + endDongle.x) / 2, y: (startDongle.y + endDongle.y) / 2 };
  const scale = Math.abs(startDongle.x - endDongle.x) + Math.abs(startDongle.y - endDongle.y) + 1;
  const bendCost = (node: number) => {
    const p = pointOf(node);
    return BEND_COST + ((Math.abs(p.x - centre.x) + Math.abs(p.y - centre.y)) / scale) * 1e-3;
  };

  const stateCount = cols * rows * 4;
  const best = new Float64Array(stateCount).fill(Infinity);
  const from = new Int32Array(stateCount).fill(-1);
  const queue = new Queue();
  const startState = startNode * 4 + headingIndex(leave);
  best[startState] = 0;
  queue.push(0, startState);

  let goal = -1;
  let goalCost = Infinity;
  const arriveIndex = headingIndex(arrive);

  while (queue.size > 0) {
    const [cost, state] = queue.pop();
    if (cost > best[state]!) continue;
    if (cost >= goalCost) break;
    const node = Math.floor(state / 4);
    const heading = state % 4;
    if (node === endNode) {
      // Coming in any other way than square to the end costs one more bend.
      const total = cost + (heading === arriveIndex ? 0 : bendCost(node));
      const reversed = (heading + 2) % 4 === arriveIndex;
      if (!reversed && total < goalCost) {
        goalCost = total;
        goal = state;
      }
      continue;
    }
    const col = node % cols;
    const row = Math.floor(node / cols);
    for (let next = 0; next < 4; next += 1) {
      // Never straight back the way it came.
      if ((next + 2) % 4 === heading) continue;
      const h = HEADINGS[next]!;
      const nc = col + h.x;
      const nr = row + h.y;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const neighbour = nodeAt(nc, nr);
      if (!free(neighbour) || !passable(node, neighbour)) continue;
      const a = pointOf(node);
      const b = pointOf(neighbour);
      const step = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      const total = cost + step + (next === heading ? 0 : bendCost(node));
      const nextState = neighbour * 4 + next;
      if (total < best[nextState]!) {
        best[nextState] = total;
        from[nextState] = state;
        queue.push(total, nextState);
      }
    }
  }

  if (goal < 0) return null;
  const path: Point[] = [];
  for (let state = goal; state >= 0; state = from[state]!) {
    path.push(pointOf(Math.floor(state / 4)));
  }
  path.reverse();
  return simplify([startEnd.point, ...path, endEnd.point]);
}
