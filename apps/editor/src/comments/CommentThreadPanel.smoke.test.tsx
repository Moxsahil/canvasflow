import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CommentThreadPanel, type CommentThreadPanelProps } from './CommentThreadPanel';
import type { CommentThread } from './comment-model';

const noop = () => {};

// The composer sizes its field in a layout effect, which a server render skips
// and warns about; the markup these tests read is complete without it.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((message: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string' && message.includes('useLayoutEffect does nothing')) return;
    consoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

const ada = { id: 'u-ada', name: 'Ada' };
const grace = { id: 'u-grace', name: 'Grace' };

const thread: CommentThread = {
  id: 't1',
  createdBy: ada.id,
  createdAt: Date.now() - 3_600_000,
  anchor: { shapeId: null, at: { x: 0.5, y: 0.5 }, point: { x: 0, y: 0 } },
  resolved: null,
  comments: [
    {
      id: 'c1',
      authorId: ada.id,
      authorName: 'Ada',
      authorUsername: null,
      createdAt: Date.now() - 3_600_000,
      editedAt: null,
      body: 'Is this the final colour?',
      mentions: [],
      reactions: [],
    },
    {
      id: 'c2',
      authorId: grace.id,
      authorName: 'Grace',
      authorUsername: null,
      createdAt: Date.now() - 60_000 * 5,
      editedAt: Date.now() - 60_000,
      body: 'Not yet.\nTwo more to try.',
      mentions: [],
      reactions: [],
    },
  ],
};

function render(props: Partial<CommentThreadPanelProps> = {}): string {
  return renderToString(
    <CommentThreadPanel
      thread={thread}
      user={ada}
      canComment
      photos={{}}
      theme="light"
      onReply={noop}
      onEdit={noop}
      onReact={noop}
      onDeleteComment={noop}
      onResolve={noop}
      onReopen={noop}
      onDeleteThread={noop}
      onClose={noop}
      {...props}
    />,
  );
}

/** The markup of the comment with this id, up to the next one. */
function card(html: string, id: string): string {
  return (
    html
      .split('data-testid="comment-card"')
      .find((part) => part.includes(`data-comment-id="${id}"`)) ?? ''
  );
}

describe('CommentThreadPanel', () => {
  it('shows every comment, who wrote it, when, and whether it was edited', () => {
    const html = render();

    expect(html).toContain('2 comments');
    // Your own goes by your face alone; theirs is named under the bubble.
    expect(card(html, 'c1')).toContain('Is this the final colour?');
    expect(card(html, 'c1')).toContain('1h ago');
    expect(card(html, 'c2')).toContain('Grace');
    expect(card(html, 'c2')).toContain('5m ago');
    expect(card(html, 'c2')).toContain('edited');
    expect(card(html, 'c1')).not.toContain('edited');
  });

  it('puts your own comments on the right, filled, and everyone else’s on the left', () => {
    const html = render();
    const own = html.split('data-comment-id="c1"')[0]!.split('<article').pop()!;
    const theirs = html.split('data-comment-id="c2"')[0]!.split('<article').pop()!;
    expect(own).toContain('flex-row-reverse');
    expect(card(html, 'c1')).toContain('data-side="end"');
    expect(card(html, 'c1')).toContain('bg-neutral-900');
    expect(theirs).not.toContain('flex-row-reverse');
    expect(card(html, 'c2')).toContain('data-side="start"');
    expect(card(html, 'c2')).not.toContain('bg-neutral-900');
  });

  it('puts edit and delete behind your own comment’s three dots, and reply on everyone else’s', () => {
    const html = render();

    // Your own: the three dots that hold Edit and Delete, and nothing to answer.
    expect(card(html, 'c1')).toContain('aria-label="More actions"');
    expect(card(html, 'c1')).not.toContain('aria-label="Reply to');
    // Someone else's: an emoji and Reply, and no dots.
    expect(card(html, 'c2')).toContain('aria-label="Reply to Grace"');
    expect(card(html, 'c2')).toContain('aria-label="Add reaction"');
    expect(card(html, 'c2')).not.toContain('aria-label="More actions"');
  });

  it('sets the face beside the bubble, and who and when under it, actions after the time', () => {
    const html = render();
    for (const id of ['c1', 'c2']) {
      const markup = card(html, id);
      // The bubble, then the line under it, with the actions after the time.
      const bubble = markup.indexOf('rounded-lg');
      expect(bubble).toBeGreaterThan(-1);
      expect(markup.indexOf('<time')).toBeGreaterThan(bubble);
      expect(markup.indexOf('comment-actions')).toBeGreaterThan(markup.indexOf('<time'));
    }
    // Their name on the line under their bubble; yours goes without saying.
    expect(card(html, 'c2')).toContain('Grace');
    expect(card(html, 'c1')).not.toContain('>You<');
  });

  it('offers no Reply once the thread is settled, as there is nowhere to write one', () => {
    const html = render({ thread: { ...thread, resolved: { at: 1, by: 'u-ada', byName: 'Ada' } } });
    expect(html).not.toContain('aria-label="Reply to');
  });

  it('lets whoever started the thread delete it, and anyone who can comment settle it', () => {
    const starter = render();
    const other = render({ user: grace });

    expect(starter).toContain('aria-label="Delete thread"');
    expect(other).not.toContain('aria-label="Delete thread"');
    expect(starter).toContain('aria-label="Resolve"');
    expect(other).toContain('aria-label="Resolve"');
  });

  it('has a field to reply in, with an emoji and a person to put in it', () => {
    const html = render();

    expect(html).toContain('aria-label="Reply, @mention someone…"');
    expect(html).toContain('aria-label="Add emoji"');
    expect(html).toContain('aria-label="Mention someone"');
  });

  it('marks every mention the same way, whoever it names and wherever it is', () => {
    const naming: CommentThread = {
      ...thread,
      comments: [
        { ...thread.comments[0]!, body: 'Ask @Grace, then @Ada signs off', mentions: [grace, ada] },
        { ...thread.comments[1]!, body: 'Over to @Ada', mentions: [ada] },
      ],
    };
    const html = render({ thread: naming });

    expect(html).toMatch(/data-mention="u-grace">@<!-- -->Grace</);
    expect(html).toMatch(/data-mention="u-ada">@<!-- -->Ada</);
    const marks = [...html.matchAll(/<span class="([^"]*)" data-mention=/g)].map((m) => m[1]);
    // In your own bubble and in someone else's, naming the reader or not: one look.
    expect(marks).toHaveLength(3);
    expect(new Set(marks).size).toBe(1);
    // Blue words, and nothing behind them.
    expect(marks[0]).toContain('text-blue-500');
    expect(marks[0]).not.toMatch(/\bbg-/);
  });

  it('shows the emoji left on a comment, how many gave each, and which are yours', () => {
    const reacted: CommentThread = {
      ...thread,
      comments: [
        {
          ...thread.comments[0]!,
          reactions: [
            { emoji: '🎉', by: [grace, ada] },
            { emoji: '👀', by: [grace] },
          ],
        },
        thread.comments[1]!,
      ],
    };
    const html = render({ thread: reacted });
    const chips = card(html, 'c1').split('data-testid="comment-reaction"');

    expect(chips).toHaveLength(3);
    expect(card(html, 'c1')).toMatch(
      /aria-pressed="true"[^>]*aria-label="🎉 2, from Grace and You"/,
    );
    expect(card(html, 'c1')).toMatch(/aria-pressed="false"[^>]*aria-label="👀 1, from Grace"/);
    // One to add, on each comment, given or not.
    // An emoji is given to someone else's comment; your own has only Edit and Delete.
    expect(card(html, 'c1')).not.toContain('aria-label="Add reaction"');
    expect(card(html, 'c2')).toContain('aria-label="Add reaction"');
  });

  it('lets a viewer read the reactions and not give one', () => {
    const reacted: CommentThread = {
      ...thread,
      comments: [{ ...thread.comments[0]!, reactions: [{ emoji: '🎉', by: [grace] }] }],
    };
    const html = render({ thread: reacted, canComment: false });

    expect(html).toContain('data-testid="comment-reaction"');
    expect(html).toMatch(/disabled=""[^>]*data-testid="comment-reaction"/);
    expect(html).not.toContain('aria-label="Add reaction"');
  });

  it('gives a viewer the thread to read and nothing to change it with', () => {
    const html = render({ canComment: false });

    expect(html).toContain('Is this the final colour?');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('aria-label="Resolve"');
    expect(html).not.toContain('aria-label="Edit"');
    expect(html).not.toContain('aria-label="Delete thread"');
    expect(html).toContain('aria-label="Close"');
  });

  it('says who settled a thread, and swaps replying for reopening', () => {
    const html = render({
      thread: { ...thread, resolved: { at: Date.now() - 120_000, by: grace.id, byName: 'Grace' } },
    });

    expect(html).toMatch(/Resolved by <!-- -->Grace/);
    expect(html).toContain('aria-label="Reopen"');
    expect(html).not.toContain('aria-label="Resolve"');
    expect(html).not.toContain('aria-label="Reply, @mention someone…"');
  });
});
