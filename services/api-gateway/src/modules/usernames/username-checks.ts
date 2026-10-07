import { parseUsername } from '@canvasflow/db';
import { USERNAME_CHECK_LIMIT } from '@canvasflow/types';

/** What a check says about one name it was asked about. */
export interface UsernameCheck {
  /** The name as it was asked about. */
  name: string;
  /** As it would be stored. Null when it breaks a rule. */
  username: string | null;
  available: boolean;
  /** Why it cannot be had: a rule it breaks, or that somebody has it. */
  problem: string | null;
}

export const TAKEN = 'That username is taken.';

/**
 * The names a check asks about, from `?name=` given once or several times,
 * or why there is nothing to answer.
 */
export function namesAsked(
  query: unknown,
): { ok: true; names: string[] } | { ok: false; error: string } {
  const names =
    typeof query === 'string'
      ? [query]
      : Array.isArray(query) && query.every((name) => typeof name === 'string')
        ? (query as string[])
        : [];
  if (names.length === 0) return { ok: false, error: 'Name a username to check.' };
  if (names.length > USERNAME_CHECK_LIMIT) {
    return { ok: false, error: `Check ${USERNAME_CHECK_LIMIT} usernames or fewer at once.` };
  }
  return { ok: true, names };
}

/**
 * Each name held to the rules, and the usernames worth looking up: the ones
 * that pass, each once. A name that breaks a rule is answered without the
 * database; the rest are looked up together.
 */
export function planChecks(names: readonly string[]) {
  const parsed = names.map((name) => ({ name, result: parseUsername(name) }));
  const lookups = [
    ...new Set(parsed.flatMap(({ result }) => (result.ok ? [result.username] : []))),
  ];
  return { parsed, lookups };
}

/**
 * The answers, in the order asked, given who holds the names looked up.
 *
 * A name the caller holds reads as free to them: it is theirs to keep.
 */
export function answerChecks(
  parsed: ReturnType<typeof planChecks>['parsed'],
  holders: ReadonlyMap<string, string>,
  callerId: string,
): UsernameCheck[] {
  return parsed.map(({ name, result }) => {
    if (!result.ok) return { name, username: null, available: false, problem: result.error };
    const holder = holders.get(result.username);
    const available = holder === undefined || holder === callerId;
    return { name, username: result.username, available, problem: available ? null : TAKEN };
  });
}
