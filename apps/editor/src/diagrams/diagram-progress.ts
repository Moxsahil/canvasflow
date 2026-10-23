/**
 * How far a diagram has got, read from the lines that have arrived.
 *
 * Every step the panel shows is one of these, worked out from the stream
 * itself: nothing is said to be happening that the lines do not show.
 */

export type WorkPhase = 'reading' | 'layout' | 'boxes' | 'arrows' | 'fixing';

export interface DiagramProgress {
  phase: WorkPhase;
  /** The way it runs, once the layout line has arrived. */
  direction: 'TB' | 'LR' | null;
  /** The boxes' labels, in the order they arrived. */
  boxes: string[];
  /** A mind map's topics, in the order they arrived; empty for a diagram. */
  topics: string[];
  arrows: number;
  /** Lines being fixed by the one fix-up pass; 0 when there is none. */
  fixing: number;
}

export function progressOf(lines: readonly string[], fixing = 0): DiagramProgress {
  let direction: 'TB' | 'LR' | null = null;
  const boxes: string[] = [];
  const topics: string[] = [];
  let arrows = 0;
  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const element = parsed as { t?: unknown; direction?: unknown; text?: unknown };
    if (element.t === 'meta') direction = element.direction === 'LR' ? 'LR' : 'TB';
    else if (element.t === 'node' && typeof element.text === 'string') boxes.push(element.text);
    else if (element.t === 'edge') arrows += 1;
    else if (element.t === 'topic' && typeof element.text === 'string') topics.push(element.text);
  }
  const phase: WorkPhase =
    fixing > 0
      ? 'fixing'
      : arrows > 0
        ? 'arrows'
        : boxes.length > 0 || topics.length > 0
          ? 'boxes'
          : direction
            ? 'layout'
            : 'reading';
  return { phase, direction, boxes, topics, arrows, fixing };
}

/** Whether a streamed line is the gateway saying it has started the fix-up pass, and for how many lines. */
export function fixingLines(line: string): number | null {
  if (!line.includes('"t":"status"')) return null;
  try {
    const parsed = JSON.parse(line) as { t?: unknown; phase?: unknown; lines?: unknown };
    if (parsed.t === 'status' && parsed.phase === 'fixing') {
      return typeof parsed.lines === 'number' && parsed.lines > 0 ? parsed.lines : 1;
    }
  } catch {
    // Not a status line after all.
  }
  return null;
}
