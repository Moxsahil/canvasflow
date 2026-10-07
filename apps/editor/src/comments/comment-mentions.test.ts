import { describe, expect, it } from 'vitest';
import {
  insertMention,
  mentionCandidates,
  mentionQueryAt,
  mentionablePeople,
  mentionsIn,
  splitMentions,
} from './comment-mentions';
import type { CommentAuthor, CommentThread } from './comment-model';

const ada = { id: 'u-ada', name: 'Ada Lovelace' };
const adam = { id: 'u-adam', name: 'Adam' };
const grace = { id: 'u-grace', name: 'Grace Hopper' };
const people = [ada, adam, grace];

/** A mention of someone, as the words after the @ read in the body. */
const named = (person: CommentAuthor, written = person.name) => ({ person, written });

const moksh = { id: 'u-moksh', name: 'Moksh Kumar', username: 'moksshhh_.20' };
const linus = { id: 'u-linus', name: 'Linus', username: 'ada' };

describe('mentionQueryAt', () => {
  const at = (text: string) => mentionQueryAt(text, text.length);

  it('finds the name being typed after an @', () => {
    expect(at('@')).toEqual({ start: 0, query: '' });
    expect(at('Ask @gr')).toEqual({ start: 4, query: 'gr' });
    expect(at('Ask @Grace Ho')).toEqual({ start: 4, query: 'Grace Ho' });
    expect(at('(@ad')).toEqual({ start: 1, query: 'ad' });
  });

  it('reads it at the caret, not at the end of the text', () => {
    expect(mentionQueryAt('Ask @gr about it', 7)).toEqual({ start: 4, query: 'gr' });
    expect(mentionQueryAt('Ask @gr about it', 3)).toBeNull();
  });

  it('leaves an @ inside a word alone', () => {
    expect(at('mail me at ada@example.com')).toBeNull();
  });

  it('gives up once the text has plainly moved on from a name', () => {
    expect(at('@ ')).toBeNull();
    expect(at('@Grace  then')).toBeNull();
    expect(at('@Grace\nnext line')).toBeNull();
    expect(at(`@${'x'.repeat(41)}`)).toBeNull();
  });
});

describe('mentionCandidates', () => {
  it('offers everyone for a bare @', () => {
    expect(mentionCandidates('', people)).toEqual([ada, adam, grace]);
  });

  it('puts names that begin with what was typed ahead of surnames that do', () => {
    const hopper = { id: 'u-h', name: 'Hopper Adams' };
    expect(mentionCandidates('ho', [grace, hopper])).toEqual([hopper, grace]);
    expect(mentionCandidates('ADA', people)).toEqual([ada, adam]);
  });

  it('finds people by the start of their username too, alongside names', () => {
    expect(mentionCandidates('moks', [ada, moksh])).toEqual([moksh]);
    // A username matching ranks with a name matching, not after it.
    expect(mentionCandidates('ada', [ada, adam, linus])).toEqual([ada, adam, linus]);
    expect(mentionCandidates('moksshhh_.', [moksh])).toEqual([moksh]);
  });

  it('offers nobody for a name nobody has', () => {
    expect(mentionCandidates('zed', people)).toEqual([]);
  });

  it('stops at six', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `u${i}`, name: `Sam ${i}` }));
    expect(mentionCandidates('sam', many)).toHaveLength(6);
  });
});

describe('insertMention', () => {
  it('finishes the name being typed and leaves the caret after it', () => {
    expect(insertMention('Ask @gr', 4, 7, grace)).toEqual({
      text: 'Ask @Grace Hopper ',
      caret: 18,
    });
  });

  it('keeps what follows the caret, without doubling the space', () => {
    expect(insertMention('Ask @gr about it', 4, 7, grace).text).toBe('Ask @Grace Hopper about it');
  });
});

describe('splitMentions', () => {
  it('cuts a body at the people it names', () => {
    expect(splitMentions('Ask @Grace Hopper, then @Adam.', people)).toEqual([
      'Ask ',
      named(grace),
      ', then ',
      named(adam),
      '.',
    ]);
  });

  it('takes the longest name that fits, and not a name inside a longer word', () => {
    const shortAda = { id: 'u-a', name: 'Ada' };
    expect(splitMentions('@Ada Lovelace', [shortAda, ada])).toEqual([named(ada)]);
    expect(splitMentions('@Adam', [shortAda])).toEqual(['@Adam']);
    expect(splitMentions('@Ada!', [shortAda])).toEqual([named(shortAda), '!']);
  });

  it('knows a username typed out, however it was cased, and keeps it as written', () => {
    expect(splitMentions('Over to @moksshhh_.20 now', [moksh])).toEqual([
      'Over to ',
      named(moksh, 'moksshhh_.20'),
      ' now',
    ]);
    expect(splitMentions('@Moksshhh_.20', [moksh])).toEqual([named(moksh, 'Moksshhh_.20')]);
  });

  it('reads a period after a username as the end of a sentence, not more of the name', () => {
    expect(splitMentions('Thanks @ada.', [linus])).toEqual(['Thanks ', named(linus, 'ada'), '.']);
    // More username after the period: somebody else's, not this one's.
    expect(splitMentions('@ada.l', [linus])).toEqual(['@ada.l']);
    expect(splitMentions('@ada_l', [linus])).toEqual(['@ada_l']);
  });

  it('takes the name over a username spelled the same, as the list writes names', () => {
    const shortAda = { id: 'u-a', name: 'ada' };
    expect(splitMentions('@ada', [linus, shortAda])).toEqual([named(shortAda)]);
  });

  it('leaves a body that names nobody as it is', () => {
    expect(splitMentions('Plain @nobody here', people)).toEqual(['Plain @nobody here']);
    expect(splitMentions('to ada@Adam', people)).toEqual(['to ada@Adam']);
    expect(splitMentions('Plain', [])).toEqual(['Plain']);
  });
});

describe('mentionsIn', () => {
  it('lists who a body names, each once, in the order they appear', () => {
    expect(mentionsIn('@Grace Hopper and @Adam, and @Grace Hopper again', people)).toEqual([
      grace,
      adam,
    ]);
    expect(mentionsIn('Nobody here', people)).toEqual([]);
  });

  it('records somebody named by username as themselves, name and all', () => {
    expect(mentionsIn('@moksshhh_.20 and @Moksh Kumar', [moksh])).toEqual([moksh]);
  });
});

describe('mentionablePeople', () => {
  const thread = {
    id: 't1',
    createdBy: 'u-grace',
    createdAt: 1,
    anchor: { shapeId: null, at: { x: 0.5, y: 0.5 }, point: { x: 0, y: 0 } },
    resolved: null,
    comments: [
      {
        id: 'c1',
        authorId: 'u-grace',
        authorName: 'Grace H',
        authorUsername: null,
        createdAt: 1,
        editedAt: null,
        body: 'Over to @Adam',
        mentions: [adam],
        reactions: [],
      },
    ],
  } satisfies CommentThread;

  it('is everyone on the board now and everyone in its comments, by name', () => {
    expect(mentionablePeople([ada], [thread], null)).toEqual([
      ada,
      adam,
      { id: 'u-grace', name: 'Grace H' },
    ]);
  });

  it('takes the name someone has now over the one on an old comment', () => {
    expect(mentionablePeople([grace], [thread], null)).toContainEqual(grace);
  });

  it('carries usernames, from comments and from whoever is here now', () => {
    const written = {
      ...thread,
      comments: [
        {
          ...thread.comments[0]!,
          authorUsername: 'grace_h',
          mentions: [{ ...adam, username: 'adam' }],
        },
      ],
    };
    expect(mentionablePeople([], [written], null)).toEqual([
      { ...adam, username: 'adam' },
      { id: 'u-grace', name: 'Grace H', username: 'grace_h' },
    ]);
    // Here now, with a newer username, wins.
    expect(mentionablePeople([{ ...grace, username: 'hopper' }], [written], null)).toContainEqual({
      ...grace,
      username: 'hopper',
    });
    // Here now on an older build that publishes none: the known one stands.
    expect(mentionablePeople([grace], [written], null)).toContainEqual({
      ...grace,
      username: 'grace_h',
    });
  });

  it('leaves out whoever is asking', () => {
    expect(mentionablePeople([ada, grace], [thread], 'u-ada').map((p) => p.id)).toEqual([
      'u-adam',
      'u-grace',
    ]);
  });
});
