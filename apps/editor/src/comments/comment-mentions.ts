import type { CommentAuthor, CommentThread } from './comment-model';

/** How many people the list under an @ offers at once. */
const OFFERED = 6;
/** Past this an @ is taken to be part of a sentence, not the start of a name. */
const LONGEST_QUERY = 40;

/**
 * A mention is written as plain text: an @ and the person's name, as it reads
 * in the comment, or their username. Who was meant is worked out from the text
 * when the comment is posted and kept beside it, so the body stays something
 * that can be typed, edited, searched and shortened like any other sentence.
 *
 * Picking someone from the list writes their name; typing their username out
 * names them just as well.
 */

/** Characters a name can follow: the start of the text, a space, or an opening bracket. */
const opensMention = (before: string) => before === '' || /[\s([{]/.test(before);
/** A letter or digit straight after a name means it was a longer word: @Ada is not in @Adam. */
const continuesWord = (after: string) => /[\p{L}\p{N}_]/u.test(after);
/**
 * A username goes on through a period that has more of it after: `@ada.l` is
 * not `@ada`, but the period in "thanks @ada." ends the sentence.
 */
const continuesUsername = (after: string) =>
  continuesWord(after.slice(0, 1)) || /^\.[a-z0-9_]/i.test(after);

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
 * The people a typed name could be, best first: names or usernames that begin
 * with it, then names with a later word that does.
 */
export function mentionCandidates(
  query: string,
  people: readonly CommentAuthor[],
): CommentAuthor[] {
  const typed = query.toLowerCase();
  const ranked = people.flatMap((person) => {
    const name = person.name.toLowerCase();
    if (name.startsWith(typed) || person.username?.startsWith(typed)) {
      return [{ person, rank: 0 }];
    }
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

/** Someone a body names, and how they were written after the @. */
export interface MentionPart {
  readonly person: CommentAuthor;
  /** Their name as it reads, or their username as it was typed. */
  readonly written: string;
}

interface Spelling {
  readonly text: string;
  readonly person: CommentAuthor;
  readonly username: boolean;
}

/**
 * Every way each person can be written after an @: their name, and their
 * username if they have one. Longest first, so "@Ada Lovelace" is not read as
 * "@Ada" and a surname. Where a name and somebody's username are the same
 * length, the name comes first: it is what the list writes when somebody is
 * picked from it.
 */
const spellingsOf = (people: readonly CommentAuthor[]): Spelling[] =>
  people
    .flatMap((person) => [
      ...(person.name.trim() !== '' ? [{ text: person.name, person, username: false }] : []),
      ...(person.username ? [{ text: person.username, person, username: true }] : []),
    ])
    .sort((a, b) => b.text.length - a.text.length || Number(a.username) - Number(b.username));

/**
 * Whether the body names somebody this way straight after the @ at `at`. A
 * name as it reads, exactly; a username however it was cased, as usernames
 * are one name in any case.
 */
function writtenAt(body: string, at: number, spelling: Spelling): boolean {
  const start = at + 1;
  const end = start + spelling.text.length;
  const written = body.slice(start, end);
  return spelling.username
    ? written.toLowerCase() === spelling.text && !continuesUsername(body.slice(end, end + 2))
    : written === spelling.text && !continuesWord(body.slice(end, end + 1));
}

/**
 * A body cut at its mentions: the stretches of plain text, and between them
 * the people named, with the words they were named by.
 */
export function splitMentions(
  body: string,
  people: readonly CommentAuthor[],
): (string | MentionPart)[] {
  const spellings = spellingsOf(people);
  if (spellings.length === 0) return body === '' ? [] : [body];

  const parts: (string | MentionPart)[] = [];
  let plain = '';
  let at = 0;
  while (at < body.length) {
    const spelling =
      body[at] === '@' && opensMention(body.slice(at - 1, at))
        ? spellings.find((candidate) => writtenAt(body, at, candidate))
        : undefined;
    if (!spelling) {
      plain += body[at];
      at += 1;
      continue;
    }
    if (plain) parts.push(plain);
    plain = '';
    const written = body.slice(at + 1, at + 1 + spelling.text.length);
    parts.push({ person: spelling.person, written });
    at += 1 + written.length;
  }
  if (plain) parts.push(plain);
  return parts;
}

/** The people a body names, each once, in the order they first appear. */
export function mentionsIn(body: string, people: readonly CommentAuthor[]): CommentAuthor[] {
  const named = new Map<string, CommentAuthor>();
  for (const part of splitMentions(body, people)) {
    if (typeof part !== 'string' && !named.has(part.person.id)) {
      named.set(part.person.id, part.person);
    }
  }
  return [...named.values()];
}

/**
 * Who can be named on this board: everyone on it now, and everyone who has
 * written or been named in a comment on it. Not whoever is asking — a note to
 * oneself needs no @.
 *
 * Someone here now is listed under the name and username they have now, which
 * win over older ones left on a comment.
 */
export function mentionablePeople(
  present: readonly CommentAuthor[],
  threads: readonly CommentThread[],
  selfId: string | null,
): CommentAuthor[] {
  const people = new Map<string, CommentAuthor>();
  // Later news of somebody replaces earlier, except that nothing without a
  // username takes one away: a username can be changed but not removed, so
  // its absence only means a comment written before they were kept, or a peer
  // on an older build.
  const learn = (person: CommentAuthor) => {
    const username = person.username ?? people.get(person.id)?.username;
    people.set(
      person.id,
      username
        ? { id: person.id, name: person.name, username }
        : { id: person.id, name: person.name },
    );
  };

  for (const thread of threads) {
    for (const comment of thread.comments) {
      for (const person of comment.mentions) learn(person);
      if (comment.authorName) {
        learn({
          id: comment.authorId,
          name: comment.authorName,
          ...(comment.authorUsername ? { username: comment.authorUsername } : {}),
        });
      }
    }
  }
  for (const person of present) if (person.name) learn(person);
  if (selfId) people.delete(selfId);
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}
