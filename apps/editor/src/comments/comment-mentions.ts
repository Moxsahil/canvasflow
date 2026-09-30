import type { CommentAuthor, CommentThread } from './comment-model';

/** How many people the list under an @ offers at once. */
const OFFERED = 6;
/** Past this an @ is taken to be part of a sentence, not the start of a name. */
const LONGEST_QUERY = 40;

/**
 * A mention is written as plain text: an @ and the person's name, as it reads
 * in the comment. Who was meant is worked out from the text when the comment is
 * posted and kept beside it, so the body stays something that can be typed,
 * edited, searched and shortened like any other sentence.
 */

/** Characters a name can follow: the start of the text, a space, or an opening bracket. */
const opensMention = (before: string) => before === '' || /[\s([{]/.test(before);
/** A letter or digit straight after a name means it was a longer word: @Ada is not in @Adam. */
const continuesWord = (after: string) => /[\p{L}\p{N}_]/u.test(after);

/**
 * The name being typed at the caret, if the caret is in one: where its @
 * stands, and what has been typed after it.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const upTo = text.slice(0, caret);
  const start = upTo.lastIndexOf('@');
  if (start === -1 || !opensMention(upTo.slice(start - 1, start))) return null;

  const query = upTo.slice(start + 1);
  if (query.length > LONGEST_QUERY || query.includes('\n')) return null;
  // A name may have spaces in it, but not one straight after the @, nor two
  // running.
  if (query.startsWith(' ') || query.includes('  ')) return null;
  return { start, query };
}

/**
 * The people a typed name could be, best first: names that begin with it, then
 * names with a later word that does.
 */
export function mentionCandidates(
  query: string,
  people: readonly CommentAuthor[],
): CommentAuthor[] {
  const typed = query.toLowerCase();
  const ranked = people.flatMap((person) => {
    const name = person.name.toLowerCase();
    if (name.startsWith(typed)) return [{ person, rank: 0 }];
    if (name.split(/\s+/).some((word) => word.startsWith(typed))) return [{ person, rank: 1 }];
    return [];
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.person.name.localeCompare(b.person.name))
    .slice(0, OFFERED)
    .map(({ person }) => person);
}

/** The text with the name being typed finished, and where the caret goes after it. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  person: CommentAuthor,
): { text: string; caret: number } {
  const written = `@${person.name} `;
  // The space after a name is not doubled when one is already there.
  const rest = text.slice(caret).replace(/^ /, '');
  return { text: text.slice(0, start) + written + rest, caret: start + written.length };
}

/** Longest names first, so "@Ada Lovelace" is not read as "@Ada" and a surname. */
const longestFirst = (people: readonly CommentAuthor[]) =>
  [...people]
    .filter((person) => person.name.trim() !== '')
    .sort((a, b) => b.name.length - a.name.length);

/**
 * A body cut at its mentions: the stretches of plain text, and between them
 * the people named.
 */
export function splitMentions(
  body: string,
  people: readonly CommentAuthor[],
): (string | CommentAuthor)[] {
  const known = longestFirst(people);
  if (known.length === 0) return body === '' ? [] : [body];

  const parts: (string | CommentAuthor)[] = [];
  let plain = '';
  let at = 0;
  while (at < body.length) {
    const person =
      body[at] === '@' && opensMention(body.slice(at - 1, at))
        ? known.find(
            ({ name }) =>
              body.startsWith(name, at + 1) &&
              !continuesWord(body.slice(at + 1 + name.length, at + 2 + name.length)),
          )
        : undefined;
    if (!person) {
      plain += body[at];
      at += 1;
      continue;
    }
    if (plain) parts.push(plain);
    plain = '';
    parts.push(person);
    at += 1 + person.name.length;
  }
  if (plain) parts.push(plain);
  return parts;
}

/** The people a body names, each once, in the order they first appear. */
export function mentionsIn(body: string, people: readonly CommentAuthor[]): CommentAuthor[] {
  const named = new Map<string, CommentAuthor>();
  for (const part of splitMentions(body, people)) {
    if (typeof part !== 'string' && !named.has(part.id)) named.set(part.id, part);
  }
  return [...named.values()];
}

/**
 * Who can be named on this board: everyone on it now, and everyone who has
 * written or been named in a comment on it. Not whoever is asking — a note to
 * oneself needs no @.
 *
 * Someone here now is listed under the name they have now, which wins over an
 * older one left on a comment.
 */
export function mentionablePeople(
  present: readonly CommentAuthor[],
  threads: readonly CommentThread[],
  selfId: string | null,
): CommentAuthor[] {
  const people = new Map<string, CommentAuthor>();
  for (const thread of threads) {
    for (const comment of thread.comments) {
      for (const person of comment.mentions) people.set(person.id, person);
      if (comment.authorName) {
        people.set(comment.authorId, { id: comment.authorId, name: comment.authorName });
      }
    }
  }
  for (const person of present) if (person.name) people.set(person.id, person);
  if (selfId) people.delete(selfId);
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}
