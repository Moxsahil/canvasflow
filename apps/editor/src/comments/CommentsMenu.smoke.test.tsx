import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommentsList } from './CommentsMenu';
import {
  commentListCounts,
  commentSnippet,
  lastActivity,
  listedThreads,
  type CommentListFilter,
} from './comment-list';
import type { CommentThread } from './comment-model';

const noop = () => {};
const now = Date.now();

function thread(
  id: string,
  bodies: [author: string, body: string, minutesAgo: number][],
  resolved = false,
): CommentThread {
  return {
    id,
    createdBy: `u-${bodies[0]![0].toLowerCase()}`,
    createdAt: now - bodies[0]![2] * 60_000,
    anchor: { shapeId: null, at: { x: 0.5, y: 0.5 }, point: { x: 0, y: 0 } },
    resolved: resolved ? { at: now, by: 'u-ada', byName: 'Ada' } : null,
    comments: bodies.map(([author, body, minutesAgo], i) => ({
      id: `${id}-c${i}`,
      authorId: `u-${author.toLowerCase()}`,
      authorName: author,
      authorUsername: null,
      createdAt: now - minutesAgo * 60_000,
      editedAt: null,
      body,
      mentions: [],
      reactions: [],
    })),
  };
}

const colour = thread('colour', [
  ['Ada', 'Is this the final colour?\nI have doubts.', 120],
  ['Grace', 'Two more to try.', 3],
]);
const logo = thread('logo', [['Grace', 'The logo is off-centre', 30]]);
const done = thread('done', [['Ada', 'Typo in the heading', 600]], true);
const threads = [colour, logo, done];

const rows = (html: string) =>
  [...html.matchAll(/data-thread-id="([^"]+)"/g)].map((match) => match[1]!);

describe('the comment list', () => {
  it('counts what each filter leaves', () => {
    expect(commentListCounts(threads)).toEqual({ open: 2, resolved: 1, all: 3 });
  });

  it('dates a thread by its newest comment, and lists the most recently active first', () => {
    expect(lastActivity(colour)).toBe(now - 3 * 60_000);
    expect(listedThreads(threads, 'all').map((t) => t.id)).toEqual(['colour', 'logo', 'done']);
  });

  it('keeps each filter to its own', () => {
    expect(listedThreads(threads, 'open').map((t) => t.id)).toEqual(['colour', 'logo']);
    expect(listedThreads(threads, 'resolved').map((t) => t.id)).toEqual(['done']);
  });

  it('shortens a comment to its first line', () => {
    expect(commentSnippet('Is this the final colour?\nI have doubts.')).toBe(
      'Is this the final colour?',
    );
  });
});

describe('CommentsList', () => {
  const render = (
    list: CommentThread[],
    filter: CommentListFilter = 'open',
    openThreadId: string | null = null,
  ) =>
    renderToString(
      <CommentsList
        threads={list}
        photos={{}}
        theme="light"
        openThreadId={openThreadId}
        filter={filter}
        onFilter={noop}
        container={null}
        onSelect={noop}
        onClose={noop}
      />,
    );

  it('opens on the threads still open, most recently active first', () => {
    const html = render(threads);

    expect(rows(html)).toEqual(['colour', 'logo']);
    expect(html).toContain('Is this the final colour?');
    expect(html).not.toContain('I have doubts.');
    expect(html).toContain('1 reply');
    expect(html).toContain('3m ago');
  });

  it('names what it is showing, and how many that is', () => {
    expect(render(threads)).toMatch(/comments-filter"[^>]*>Open comments<span[^>]*>2</);
    expect(render(threads, 'resolved')).toMatch(
      /comments-filter"[^>]*>Resolved comments<span[^>]*>1</,
    );
    expect(render(threads, 'all')).toMatch(/comments-filter"[^>]*>All comments<span[^>]*>3</);
  });

  it('says a resolved thread is resolved, in place of its replies', () => {
    const html = render(threads, 'all');
    const row = html.split('<button').find((part) => part.includes('data-thread-id="done"'))!;

    expect(rows(html)).toEqual(['colour', 'logo', 'done']);
    expect(row).toContain('Resolved');
  });

  it('marks the thread that is open on the board', () => {
    const html = render(threads, 'open', 'logo');
    const row = html.split('<button').find((part) => part.includes('data-thread-id="logo"'))!;

    expect(row).toContain('aria-current="true"');
  });

  it('says how to leave the first comment on a board with none', () => {
    const html = render([]);

    expect(html).toContain('No comments yet');
    expect(html).toContain('Press M and click the board to leave one.');
  });

  it('says so when everything has been resolved', () => {
    expect(render([done])).toContain('No open comments');
  });
});
