import type { WorkspacePlan } from './plans.js';

/**
 * Generating a diagram from a description: the limits on what is asked, and
 * the shapes of what the gateway answers.
 */

/** Shortest and longest description the gateway accepts, in characters. */
export const DIAGRAM_PROMPT_MIN = 3;
export const DIAGRAM_PROMPT_MAX = 8000;

/**
 * The most an existing diagram sent back to be changed may hold: lines, and
 * characters in any one line. Eighty boxes and their arrows fit well inside;
 * anything past it is not a diagram this feature drew.
 */
export const DIAGRAM_REFINE_MAX_LINES = 320;
export const DIAGRAM_LINE_MAX = 400;

/** The most boxes a diagram has, drawn or sent back to be changed. */
export const DIAGRAM_MAX_NODES = 80;

/**
 * How many of the month's diagrams a detailed one uses. Detailed runs a larger
 * model that plans before it draws, for system architectures and other big
 * diagrams, and costs the service several times what a quick one does.
 */
export const DIAGRAM_DETAILED_COST = 3;

/** What the editor sends to generate a diagram, or to change one it has. */
export interface DiagramRequest {
  boardId: string;
  /** What to draw, or, with `previous`, what to change about it. */
  description: string;
  direction?: 'TB' | 'LR';
  /** The lines of the diagram being changed, as they were streamed. */
  previous?: string[];
  /** Draw with the larger model; uses DIAGRAM_DETAILED_COST of the month's diagrams. */
  detailed?: boolean;
}

/** The `code` on a refusal because a detailed diagram needs more than is left this month. */
export const DIAGRAM_NOT_ENOUGH_LEFT = 'diagram-not-enough-left';

/** Where somebody stands against their month's allowance, on one board. */
export interface DiagramUsage {
  /** The plan of the board's workspace, which sets the limit. */
  plan: WorkspacePlan;
  used: number;
  limit: number;
  /** When the count starts again from zero (ISO 8601, UTC). */
  resetsAt: string;
}

/** The `code` on a refusal because this month's diagrams are used up. */
export const DIAGRAM_LIMIT_REACHED = 'diagram-limit-reached';

/**
 * The last line of a diagram stream, after the diagram's own lines.
 *
 * `ok` is false when nothing could be drawn — the diagram was then given back
 * and `usage` already reflects that — and `message` says why in words to show.
 */
export interface DiagramStreamEnd {
  t: 'end';
  ok: boolean;
  usage: DiagramUsage;
  message?: string;
  /** Why nothing could be drawn, for a client that words it itself. */
  reason?: DiagramFailure;
}

/**
 * A line in the stream that is about the work rather than the diagram: sent
 * before the one fix-up pass, when lines that came back broken are sent back
 * to be corrected. A client that does not know it ignores it.
 */
export interface DiagramStreamStatus {
  t: 'status';
  phase: 'fixing';
  /** How many lines are being fixed. */
  lines: number;
}

/**
 * Why a diagram came to nothing: the description could not be drawn, the
 * answer held no box, the service was busy, or it could not be reached.
 */
export type DiagramFailure = 'refused' | 'empty' | 'busy' | 'unavailable';
