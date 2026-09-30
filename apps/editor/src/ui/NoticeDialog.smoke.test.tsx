import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NoticeDialog, type Notice } from './NoticeDialog';

const noop = () => {};

const COPIED: Notice = {
  title: 'Link copied',
  body: 'Anyone who already has access can open this board with it.',
  tone: 'ok',
  link: { url: 'https://canvasflow.app/boards/abc', copied: true },
};

function render(notice: Notice | null, withShare = true) {
  return renderToString(
    <NoticeDialog
      notice={notice}
      theme="dark"
      onClose={noop}
      onLiveCollaboration={withShare ? noop : undefined}
    />,
  );
}

describe('NoticeDialog', () => {
  it('renders nothing while there is no notice', () => {
    expect(render(null)).toBe('');
  });

  it('shows a copied link with a way to copy it again and to invite someone new', () => {
    const html = render(COPIED);
    expect(html).toContain('data-testid="notice-dialog"');
    expect(html).toContain('Link copied');
    expect(html).toContain('value="https://canvasflow.app/boards/abc"');
    expect(html).toContain('Copy again');
    expect(html).toContain('Live collaboration');
    expect(html).toContain('Got it');
    expect(html).toContain('var(--surface-ok-wash)');
  });

  it('offers to try again, in the warning tone, when copying failed', () => {
    const html = render({
      ...COPIED,
      title: 'Couldn’t copy the link',
      tone: 'warn',
      link: { url: COPIED.link!.url, copied: false },
    });
    expect(html).toContain('Try again');
    expect(html).not.toContain('Copy again');
    expect(html).toContain('var(--surface-warn-wash)');
  });

  it('keeps a notice with no link to its words and Got it', () => {
    const html = render({
      title: 'Save board',
      body: 'That file couldn’t be written.',
      tone: 'warn',
    });
    expect(html).toContain('That file couldn’t be written.');
    expect(html).not.toContain('Board link');
    expect(html).not.toContain('Live collaboration');
    expect(html).toContain('Got it');
  });

  it('leaves out Live collaboration where sharing is not offered', () => {
    expect(render(COPIED, false)).not.toContain('Live collaboration');
  });
});
