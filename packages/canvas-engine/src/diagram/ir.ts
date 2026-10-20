/**
 * The shape of a diagram before it has any geometry.
 *
 * A generated diagram arrives as a graph — what the boxes say and what points
 * at what — and nothing else. Positions, sizes and routes are computed here,
 * from the text, by code that can be tested. Nothing upstream is trusted to
 * place anything, which is what keeps a generated board indistinguishable from
 * a drawn one and lets the same description be laid out again after the rules
 * change.
 */

/** The node shapes this module knows how to draw. */
export const NODE_KINDS = ['rectangle', 'ellipse', 'diamond'] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/** Which way the layers run: top-to-bottom, or left-to-right. */
export const DIRECTIONS = ['TB', 'LR'] as const;

export type Direction = (typeof DIRECTIONS)[number];

export const DEFAULT_DIRECTION: Direction = 'TB';

export interface DiagramNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly text: string;
}

export interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  /** Empty when the edge carries no text. */
  readonly label: string;
}

export interface DiagramIR {
  readonly direction: Direction;
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

/** One line of the wire format, once it is understood. */
export type DiagramElement =
  | { readonly t: 'meta'; readonly direction: Direction }
  | ({ readonly t: 'node' } & DiagramNode)
  | ({ readonly t: 'edge' } & DiagramEdge);

/**
 * Why a line was rejected, in words worth showing a person — and worth
 * handing back to whatever produced the line so it can fix it.
 */
export interface DiagramLineError {
  readonly line: string;
  readonly reason: string;
}

export type ParsedLine =
  | { readonly ok: true; readonly value: DiagramElement }
  | { readonly ok: false; readonly error: DiagramLineError }
  /** The line is not finished arriving. Not an error, and not yet anything. */
  | { readonly ok: false; readonly error: null };

const MAX_TEXT_LENGTH = 200;
const MAX_ID_LENGTH = 64;

const incomplete: ParsedLine = { ok: false, error: null };

function reject(line: string, reason: string): ParsedLine {
  return { ok: false, error: { line, reason } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A readable string of bounded length, or null.
 *
 * Length is capped rather than truncated: a label long enough to break the
 * layout is a mistake upstream, and saying so is more useful than quietly
 * drawing something nobody asked for.
 */
function readString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/**
 * Read one line of the wire format.
 *
 * Lines arrive one at a time and a half-written one is the normal case, not a
 * failure — so a line that isn't valid JSON yet reports neither success nor an
 * error, and the caller simply waits for the rest of it. Only a line that
 * parses as JSON and is then wrong is worth complaining about.
 */
export function parseDiagramLine(line: string): ParsedLine {
  const trimmed = line.trim();
  if (trimmed.length === 0) return incomplete;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return incomplete;
  }

  if (!isPlainObject(parsed)) {
    return reject(trimmed, 'Expected a JSON object.');
  }

  switch (parsed.t) {
    case 'meta': {
      // A missing direction is not worth rejecting a diagram over.
      const direction = parsed.direction;
      if (direction === undefined)
        return { ok: true, value: { t: 'meta', direction: DEFAULT_DIRECTION } };
      if (!DIRECTIONS.includes(direction as Direction)) {
        return reject(
          trimmed,
          `Unknown direction ${JSON.stringify(direction)}; expected ${DIRECTIONS.join(' or ')}.`,
        );
      }
      return { ok: true, value: { t: 'meta', direction: direction as Direction } };
    }

    case 'node': {
      const id = readString(parsed.id, MAX_ID_LENGTH);
      if (id === null) return reject(trimmed, 'A node needs a non-empty string "id".');

      const kind = parsed.kind;
      if (!NODE_KINDS.includes(kind as NodeKind)) {
        return reject(
          trimmed,
          `Unknown kind ${JSON.stringify(kind)} on node "${id}"; expected one of ${NODE_KINDS.join(', ')}.`,
        );
      }

      const text = readString(parsed.text, MAX_TEXT_LENGTH);
      if (text === null) {
        return reject(
          trimmed,
          `Node "${id}" needs non-empty "text" of at most ${MAX_TEXT_LENGTH} characters.`,
        );
      }

      return { ok: true, value: { t: 'node', id, kind: kind as NodeKind, text } };
    }

    case 'edge': {
      const from = readString(parsed.from, MAX_ID_LENGTH);
      const to = readString(parsed.to, MAX_ID_LENGTH);
      if (from === null || to === null) {
        return reject(trimmed, 'An edge needs non-empty string "from" and "to".');
      }
      if (from === to) {
        return reject(trimmed, `Edge on "${from}" points at itself; self-edges are not drawn.`);
      }

      // An absent label is the common case, so it is a default rather than a
      // rejection — but a label of the wrong type is still a mistake.
      const rawLabel = parsed.label;
      if (rawLabel !== undefined && typeof rawLabel !== 'string') {
        return reject(trimmed, `Edge "${from}" → "${to}" has a non-string "label".`);
      }
      const label = rawLabel === undefined ? '' : (readString(rawLabel, MAX_TEXT_LENGTH) ?? '');

      return { ok: true, value: { t: 'edge', from, to, label } };
    }

    default:
      return reject(
        trimmed,
        `Unknown element type ${JSON.stringify(parsed.t)}; expected "meta", "node" or "edge".`,
      );
  }
}

export interface CollectedDiagram {
  readonly diagram: DiagramIR;
  /** Everything that could not be used, in the order it arrived. */
  readonly errors: readonly DiagramLineError[];
}

/**
 * Fold a stream of lines into a diagram.
 *
 * Deliberately total: a bad line is dropped and recorded, never thrown, so a
 * diagram that is nine-tenths right still draws. The errors it collects are
 * what the caller shows, and what it sends back to be corrected.
 */
export function collectDiagram(lines: readonly string[]): CollectedDiagram {
  let direction: Direction = DEFAULT_DIRECTION;
  const nodes: DiagramNode[] = [];
  const byId = new Map<string, DiagramNode>();
  const rawEdges: Array<{ edge: DiagramEdge; line: string }> = [];
  const errors: DiagramLineError[] = [];

  for (const line of lines) {
    const result = parseDiagramLine(line);
    if (!result.ok) {
      if (result.error !== null) errors.push(result.error);
      continue;
    }

    const element = result.value;
    switch (element.t) {
      case 'meta':
        direction = element.direction;
        break;

      case 'node': {
        const { t: _t, ...node } = element;
        if (byId.has(node.id)) {
          errors.push({ line: line.trim(), reason: `Duplicate node id "${node.id}".` });
          break;
        }
        byId.set(node.id, node);
        nodes.push(node);
        break;
      }

      case 'edge': {
        const { t: _t, ...edge } = element;
        // Held back rather than checked here: an edge may legitimately name a
        // node that has not streamed in yet.
        rawEdges.push({ edge, line: line.trim() });
        break;
      }
    }
  }

  const edges: DiagramEdge[] = [];
  const seen = new Set<string>();
  for (const { edge, line } of rawEdges) {
    const missing = !byId.has(edge.from) ? edge.from : !byId.has(edge.to) ? edge.to : null;
    if (missing !== null) {
      errors.push({ line, reason: `Edge references missing node "${missing}".` });
      continue;
    }
    // A repeated edge would stack two arrows in exactly the same place, which
    // reads as one arrow that cannot be selected.
    const key = JSON.stringify([edge.from, edge.to, edge.label]);
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(edge);
  }

  return { diagram: { direction, nodes, edges }, errors };
}

/**
 * Split accumulated text into lines that are certainly complete.
 *
 * The trailing fragment after the last newline is still being written, so it is
 * held back — rendering it would mean parsing a half-finished object on every
 * chunk and discarding it again.
 */
export function completeLines(accumulated: string): string[] {
  const lines = accumulated.split('\n');
  lines.pop();
  return lines;
}
