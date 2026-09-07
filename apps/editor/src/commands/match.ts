import { COMMAND_CATEGORIES, type CommandCategory } from './commands';

/**
 * A half-open `[start, end)` slice of the label that the query matched. The
 * palette draws these emphasised, so what you typed is visible in the row it
 * pulled up.
 */
export type MatchRange = readonly [number, number];

export interface Scored<T> {
  readonly item: T;
  readonly score: number;
  /** Empty when the match came from a keyword, which is never displayed. */
  readonly ranges: readonly MatchRange[];
}

/**
 * Matching a character at the very start of the label is the strongest signal
 * there is — typing "re" should reach "Redo" before "Bring forward" — and the
 * start of any later word is the next strongest. A run of adjacent characters
 * beats the same characters scattered across the label.
 */
const SCORE_LABEL_START = 14;
const SCORE_WORD_START = 9;
const SCORE_ADJACENT = 5;
const SCORE_CHARACTER = 1;
/**
 * Distance costs something, or a query would match a long label about as well
 * as the short one that actually means it. Capped so a single late match can't
 * drive an otherwise good row negative.
 */
const PENALTY_PER_SKIP = -0.6;
const PENALTY_SKIP_FLOOR = -6;
/** Enough to break ties towards the shorter label, not enough to outrank a real match. */
const PENALTY_PER_CHARACTER = 0.06;
/** A keyword hit is a genuine match, but the label the user can read wins. */
const KEYWORD_DISCOUNT = 0.4;

function isWordStart(haystack: string, at: number): boolean {
  if (at === 0) return true;
  const previous = haystack[at - 1]!;
  return previous === ' ' || previous === '-' || previous === '/' || previous === '.';
}

/**
 * Score `query` against `text` as an in-order subsequence, or return null when
 * the characters aren't all there in order.
 *
 * Deliberately greedy: it takes the first home for each character rather than
 * searching for the best arrangement. Over a list this size the difference is
 * an occasional row ranked a place lower than ideal, which is not worth the
 * cost of a full search on every keystroke.
 */
export function scoreText(text: string, query: string): Scored<string> | null {
  const haystack = text.toLowerCase();
  // Both sides are folded here rather than only at the call site, so the
  // function answers the same way whoever reaches for it.
  const needle = query.toLowerCase();
  let score = 0;
  let cursor = 0;
  let previous = -2;
  const ranges: MatchRange[] = [];

  for (const character of needle) {
    // Spaces let you type "zoom fit" for "Zoom to fit" without them having to
    // line up with the spaces in the label.
    if (character === ' ') continue;

    const at = haystack.indexOf(character, cursor);
    if (at === -1) return null;

    if (at === 0) score += SCORE_LABEL_START;
    else if (isWordStart(haystack, at)) score += SCORE_WORD_START;
    else score += SCORE_CHARACTER;

    if (at === previous + 1) {
      score += SCORE_ADJACENT;
      // Extend the run rather than starting a second highlight beside it.
      const last = ranges[ranges.length - 1]!;
      ranges[ranges.length - 1] = [last[0], at + 1];
    } else {
      score += Math.max(PENALTY_SKIP_FLOOR, (at - cursor) * PENALTY_PER_SKIP);
      ranges.push([at, at + 1]);
    }

    previous = at;
    cursor = at + 1;
  }

  return { item: text, score: score - text.length * PENALTY_PER_CHARACTER, ranges };
}

export interface Matchable {
  readonly label: string;
  readonly keywords?: readonly string[];
}

/**
 * Score one command, falling back to its keywords when the label itself does
 * not match. A keyword hit reports no ranges: it explains why the row is here,
 * but there is nothing in the visible label to underline.
 */
export function scoreCommand<T extends Matchable>(command: T, query: string): Scored<T> | null {
  const onLabel = scoreText(command.label, query);
  if (onLabel) return { item: command, score: onLabel.score, ranges: onLabel.ranges };

  let best: number | null = null;
  for (const keyword of command.keywords ?? []) {
    const hit = scoreText(keyword, query);
    if (hit && (best === null || hit.score > best)) best = hit.score;
  }

  return best === null ? null : { item: command, score: best * KEYWORD_DISCOUNT, ranges: [] };
}

/**
 * Rank `commands` against `query`, dropping what doesn't match. An empty query
 * keeps every command in the order it was given, which is the registry's own —
 * the palette opens on a readable list rather than on an arbitrary one.
 */
export function matchCommands<T extends Matchable>(
  commands: readonly T[],
  query: string,
): Scored<T>[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return commands.map((item) => ({ item, score: 0, ranges: [] }));
  }

  const scored: Scored<T>[] = [];
  for (const command of commands) {
    const hit = scoreCommand(command, trimmed);
    if (hit) scored.push(hit);
  }

  // Sorted by score, and by the registry's order within a tie — so a list that
  // scores flat, as a one-character query tends to, still reads deliberately.
  return scored
    .map((hit, index) => ({ hit, index }))
    .sort((a, b) => b.hit.score - a.hit.score || a.index - b.index)
    .map(({ hit }) => hit);
}

export interface CommandGroup<T> {
  readonly category: CommandCategory;
  readonly items: readonly Scored<T>[];
}

/**
 * Split a ranked list into its categories.
 *
 * With a query the groups follow their best match, so the closest thing to
 * what was typed is at the top whatever category it came from. Without one
 * they fall back to the fixed order in `COMMAND_CATEGORIES`, so an untouched
 * palette looks the same every time it opens.
 */
export function groupByCategory<T extends Matchable & { category: CommandCategory }>(
  scored: readonly Scored<T>[],
  ranked: boolean,
): CommandGroup<T>[] {
  const groups = new Map<CommandCategory, Scored<T>[]>();
  for (const hit of scored) {
    const existing = groups.get(hit.item.category);
    if (existing) existing.push(hit);
    else groups.set(hit.item.category, [hit]);
  }

  const order = ranked
    ? [...groups.keys()]
    : COMMAND_CATEGORIES.filter((category) => groups.has(category));

  return order.map((category) => ({ category, items: groups.get(category)! }));
}
