import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommentPeek } from './CommentPeek';
import type { CommentThread } from './comment-model';

const now = Date.now();

function thread(bodies: [author: string, body: string, minutesAgo: number][], resolved = false) {
  return {
    id: 't1',
    createdBy: 'u-ada',
    createdAt: now - bodies[0]![2] * 60_000,
    anchor: { shapeId: null, at: { x: 0.5, y: 0.5 }, point: { x: 0, y: 0 } },
    resolved: resolved ? { at: now, by: 'u-ada', byName: 'Ada' } : null,
    comments: bodies.map(([author, body, minutesAgo], i) => ({
      id: `c${i}`,
      authorId: `u-${author.toLowerCase()}`,
      authorName: author,
      createdAt: now - minutesAgo * 60_000,
      editedAt: null,
      body,
      mentions: [],
      reactions: [],
    })),
  } satisfies CommentThread;
}

describe('CommentPeek', () => {
  it('says who started the thread, how it opens, and when it last moved', () => {
    const html = renderToString(
      <CommentPeek
        thread={thread([
          ['Ada', 'Is this the final colour?', 120],
          ['Grace', 'Two more to try.', 3],
        ])}
      />,
    );

    expect(html).toContain('Ada');
    expect(html).toContain('Is this the final colour?');
    expect(html).not.toContain('Two more to try.');
    expect(html).toContain('3m ago');
    expect(html).toContain('1 reply');
  });

  it('says nothing about replies when there are none', () => {
    const html = renderToString(<CommentPeek thread={thread([['Ada', 'Alone here', 5]])} />);

    expect(html).not.toMatch(/repl/);
  });

  it('says a resolved thread is resolved', () => {
    const html = renderToString(<CommentPeek thread={thread([['Ada', 'Done with', 5]], true)} />);

    expect(html).toContain('Resolved');
  });
});
