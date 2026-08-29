import {
  createArrow,
  createDiamond,
  createEllipse,
  createFrame,
  createFreehand,
  createLine,
  createRectangle,
  createText,
  frameForShape,
  framesIn,
  type Shape,
} from '@canvasflow/canvas-engine';

/**
 * Rebuilds shapes from untrusted JSON.
 *
 * Nothing off disk is used as-is: each candidate is picked apart field by
 * field and passed back through the engine's own factories, so what reaches
 * the document is always a canonical shape with defaults filled in. Anything
 * that doesn't fit — a missing width, a string where a number belongs, an
 * object where text belongs — is dropped rather than repaired.
 *
 * The strictness is deliberate: an imported shape goes straight into the Yjs
 * document, which replicates to every collaborator and is persisted by the
 * sync server. A malformed shape isn't a local rendering glitch, it's one for
 * everyone in the room.
 */

const FILL_STYLES = ['hachure', 'cross-hatch', 'solid'] as const;
const STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const;
const EDGES = ['sharp', 'round'] as const;
const ARROW_TYPES = ['straight', 'curved', 'elbow'] as const;
const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
const ARROWHEADS = [
  'none',
  'arrow',
  'bar',
  'circle',
  'circle_outline',
  'triangle',
  'triangle_outline',
  'diamond',
  'diamond_outline',
] as const;

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}

function roughness(value: unknown): 0 | 1 | 2 | undefined {
  return value === 0 || value === 1 || value === 2 ? value : undefined;
}

function opacity(value: unknown): number | undefined {
  const n = finite(value);
  return n === undefined ? undefined : Math.min(100, Math.max(0, n));
}

/** `null` is meaningful here — it's "no fill" — so it survives the check. */
function fillColor(value: unknown): string | null | undefined {
  if (value === null) return null;
  return text(value);
}

function points(value: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<[number, number]> = [];
  for (const point of value) {
    if (!Array.isArray(point) || point.length < 2) return undefined;
    const x = finite(point[0]);
    const y = finite(point[1]);
    if (x === undefined || y === undefined) return undefined;
    out.push([x, y]);
  }
  return out;
}

function baseStyle(raw: Raw) {
  return {
    strokeColor: text(raw.strokeColor),
    fillColor: fillColor(raw.fillColor),
    fillStyle: oneOf(raw.fillStyle, FILL_STYLES),
    strokeWidth: finite(raw.strokeWidth),
    strokeStyle: oneOf(raw.strokeStyle, STROKE_STYLES),
    roughness: roughness(raw.roughness),
    opacity: opacity(raw.opacity),
    rotation: finite(raw.rotation),
    seed: finite(raw.seed),
  };
}

/**
 * One shape, or `null` if the candidate can't be trusted.
 *
 * Ids are always regenerated: a file can carry ids that collide with each
 * other or with shapes already in the document, and either would corrupt the
 * board rather than merely look wrong.
 */
export function sanitizeShape(candidate: unknown, genId: () => string): Shape | null {
  if (!isRecord(candidate)) return null;

  const x = finite(candidate.x);
  const y = finite(candidate.y);
  if (x === undefined || y === undefined) return null;

  const common = { id: genId(), x, y, ...baseStyle(candidate) };

  switch (candidate.kind) {
    case 'rectangle':
    case 'ellipse':
    case 'diamond': {
      const width = finite(candidate.width);
      const height = finite(candidate.height);
      if (width === undefined || height === undefined) return null;
      const edges = oneOf(candidate.edges, EDGES);
      if (candidate.kind === 'ellipse') {
        return createEllipse({ ...common, width, height });
      }
      const create = candidate.kind === 'rectangle' ? createRectangle : createDiamond;
      return create({ ...common, width, height, edges });
    }

    case 'line':
    case 'arrow': {
      const pts = points(candidate.points);
      // The factories throw below two points rather than returning null, so
      // the length check has to happen here.
      if (!pts || pts.length < 2) return null;
      if (candidate.kind === 'line') {
        return createLine({ ...common, points: pts, edges: oneOf(candidate.edges, EDGES) });
      }
      return createArrow({
        ...common,
        points: pts,
        startArrowhead: oneOf(candidate.startArrowhead, ARROWHEADS),
        endArrowhead: oneOf(candidate.endArrowhead, ARROWHEADS),
        arrowType: oneOf(candidate.arrowType, ARROW_TYPES),
      });
    }

    case 'freehand': {
      const pts = points(candidate.points);
      if (!pts || pts.length === 0) return null;
      return createFreehand({
        ...common,
        points: pts,
        edges: oneOf(candidate.edges, EDGES),
        simulatePressure:
          typeof candidate.simulatePressure === 'boolean' ? candidate.simulatePressure : undefined,
      });
    }

    case 'text': {
      // Specifically not coerced with String(): a Y.Text or an object here
      // would stringify to garbage and poison the document.
      const value = text(candidate.text);
      if (value === undefined) return null;
      return createText({
        ...common,
        text: value,
        fontSize: finite(candidate.fontSize),
        fontFamily: text(candidate.fontFamily),
        textAlign: oneOf(candidate.textAlign, TEXT_ALIGNS),
      });
    }

    case 'frame': {
      const width = finite(candidate.width);
      const height = finite(candidate.height);
      if (width === undefined || height === undefined) return null;
      // `frameId` is not read from the file at all. Every shape is given a
      // fresh id on the way in, so a stored one would point at nothing —
      // and it does not need to, because membership is derived from where
      // the shapes are. It is recomputed once the whole file has landed.
      return createFrame({
        ...common,
        width,
        height,
        name: typeof candidate.name === 'string' ? candidate.name : '',
      });
    }

    case 'image':
      // Dropped deliberately, not overlooked. An image shape carries only the
      // id of bytes held on the board it came from, and a board file has no
      // way to bring those bytes with it — restoring the shape would place a
      // grey box that can never resolve. The caller counts it as skipped, so
      // the loss is reported rather than discovered later.
      return null;

    default:
      // Unknown kind — a shape type from a newer version, or not a shape.
      return null;
  }
}

export interface SanitizeResult {
  shapes: Shape[];
  /** Candidates that were dropped, so the UI can say so honestly. */
  skipped: number;
}

export function sanitizeShapes(
  candidates: readonly unknown[],
  genId: () => string,
): SanitizeResult {
  const shapes: Shape[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    const shape = sanitizeShape(candidate, genId);
    if (shape) {
      shapes.push(shape);
    } else {
      skipped += 1;
    }
  }

  // Membership, rebuilt from the geometry now that every shape has its new id.
  // Nothing about who was in which frame has to survive the file for this to
  // come out right — the shapes are where they were, so the answer is too.
  const frames = framesIn(shapes);
  const restored =
    frames.length === 0
      ? shapes
      : shapes.map((shape) => {
          const frameId = frameForShape(shape, frames);
          return frameId ? { ...shape, frameId } : shape;
        });

  return { shapes: restored, skipped };
}
