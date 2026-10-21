import type { WorkspacePlan } from './plans.js';

/**
 * Generating a diagram from a description: the limits on what is asked, and
 * the shapes of what the gateway answers.
 */

/** Shortest and longest description the gateway accepts, in characters. */
export const DIAGRAM_PROMPT_MIN = 3;
export const DIAGRAM_PROMPT_MAX = 2000;

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
}
