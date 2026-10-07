import {
  USERNAME_CHECK_LIMIT,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  usernameProblem,
} from '@canvasflow/types';

/**
 * A username made from a display name or an address: what a person would
 * likely type for themselves. Null when nothing in it can become one.
 *
 * Spaces and punctuation become single underscores, and accents fall away to
 * the plain letter, so "Zoë O'Brien" is `zoe_o_brien`.
 */
export function usernameStem(from: string): string | null {
  const stem = from
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/_+$/, '');
  return stem.length >= USERNAME_MIN_LENGTH && usernameProblem(stem) === null ? stem : null;
}

/**
 * The names to offer somebody who has none yet, best first, as many as one
 * check can ask about: their own name as a username, then that with a number
 * after it, and last one with a random number, for a name common enough that
 * the small ones are gone.
 *
 * Made here, from the profile already on screen, so the server is asked one
 * question — which of these are free — and answers it with one read.
 */
export function usernameCandidates(
  person: { name: string; email: string | null },
  random: () => number = Math.random,
): string[] {
  const stem =
    usernameStem(person.name) ?? (person.email ? usernameStem(person.email.split('@')[0]!) : null);
  if (!stem) return [];

  // Room for up to three digits on the end without passing the limit.
  const base = stem.slice(0, USERNAME_MAX_LENGTH - 3).replace(/[._]+$/, '');
  const numbered = Array.from({ length: USERNAME_CHECK_LIMIT - 2 }, (_, i) => `${base}${i + 2}`);
  const lucky = `${base}${100 + Math.floor(random() * 900)}`;

  return [...new Set([stem, ...numbered, lucky])]
    .filter((name) => usernameProblem(name) === null)
    .slice(0, USERNAME_CHECK_LIMIT);
}
