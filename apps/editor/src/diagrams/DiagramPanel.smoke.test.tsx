import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { DiagramPanel } from './DiagramPanel';
import type { DiagramPanelState } from './useDiagramPanel';

const noop = () => {};

// The preview lays boxes out by measuring their labels; a stand-in measure is enough here.
beforeAll(() => {
  const global = globalThis as { OffscreenCanvas?: unknown };
  global.OffscreenCanvas ??= class {
    getContext() {
      return { font: '', measureText: (text: string) => ({ width: text.length * 8 }) };
    }
  };
});

function panel(overrides: Partial<DiagramPanelState> = {}): DiagramPanelState {
  return {
    entries: [],
    run: null,
    running: false,
    usage: { plan: 'free', used: 3, limit: 10, resetsAt: '2026-11-01T00:00:00.000Z' },
    notice: null,
    draft: '',
    setDraft: noop,
    attachments: [],
    attach: noop,
    detach: noop,
    retry: noop,
    changing: null,
    chat: 'c1',
    showChat: noop,
    markInserted: noop,
    detailed: false,
    setDetailed: noop,
    startChange: noop,
    cancelChange: noop,
    generate: async () => {},
    warmUsage: noop,
    bannerClosed: false,
    closeUsageBanner: noop,
    again: async () => {},
    rate: noop,
    stop: noop,
    dismissRun: noop,
    ...overrides,
  };
}

const render = (state: DiagramPanelState, canDraw = true) =>
  renderToString(
    <DiagramPanel
      panel={state}
      theme="dark"
      canDraw={canDraw}
      onInsert={noop}
      onSignIn={noop}
      onUpgrade={noop}
      onClose={noop}
    />,
  );

describe('DiagramPanel', () => {
  it('opens on what it does, three examples, and the month’s count', () => {
    const html = render(panel());
    expect(html).toContain('7 of 10 left');
    expect(html).toContain('Sign-up flow');
    expect(html).toContain('Release pipeline');
    expect(html).toContain('Team chart');
    expect(html).toContain('placeholder="Describe a diagram"');
    expect(html).toContain('What should we draw?');
    expect(html).toContain('Text to diagram');
    for (const soon of ['Flowchart', 'Mind map', 'Entity relationship', 'Mermaid to diagram']) {
      expect(html).toContain(soon);
    }
    expect(html).toContain('Soon');
  });

  it('says the month is used up, when it starts again, and offers the plans', () => {
    const html = render(
      panel({
        usage: { plan: 'free', used: 10, limit: 10, resetsAt: '2026-11-01T00:00:00.000Z' },
        notice: { kind: 'limit' },
      }),
    );
    expect(html).toContain('You’ve used all 10 diagrams this month');
    expect(html).toContain('Upgrade');
    expect(html).toContain('Pro gives you 100 a month');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });

  it('asks someone without an account to sign in, with nothing to type into', () => {
    const html = render(panel(), false);
    expect(html).toContain('Sign in to generate diagrams');
    expect(html).not.toContain('<textarea');
  });

  it('turns Generate into Stop and says what it is doing while a diagram is written', () => {
    const node = (text: string) => JSON.stringify({ t: 'node', id: text, kind: 'rectangle', text });
    const reading = render(
      panel({
        running: true,
        run: {
          description: 'Sign in flow',
          chatId: 'c1',
          detailed: false,
          lines: [],
          startedAt: Date.now(),
          fixing: 0,
          status: 'running',
        },
      }),
    );
    expect(reading).toContain('aria-label="Stop"');
    expect(reading).toMatch(/data-role="user"[^>]*>[\s\S]*Sign in flow/);
    expect(reading).toContain('Reading your description');
    expect(reading).toContain('aria-label="Working"');

    const drawing = render(
      panel({
        running: true,
        run: {
          description: 'Sign in flow',
          chatId: 'c1',
          detailed: false,
          lines: [JSON.stringify({ t: 'meta', direction: 'TB' }), node('Start'), node('Check')],
          startedAt: Date.now(),
          fixing: 0,
          status: 'running',
        },
      }),
    );
    expect(drawing).toContain('Read your description');
    expect(drawing).toContain('Laid it out');
    expect(drawing).toContain('Top to bottom');
    expect(drawing).toContain('Adding boxes');
    expect(drawing).toContain('Start, Check');
  });

  it('sums up a finished diagram in one line', () => {
    const html = render(
      panel({
        entries: [
          {
            id: 'e1',
            description: 'Sign in flow',
            chatId: 'c1',
            lines: [JSON.stringify({ t: 'meta', direction: 'TB' })],
            createdAt: 1,
            took: 3600,
          },
        ],
      }),
    );
    expect(html).toContain('Drawn in 3.6 s · 0 boxes, 0 arrows');
    expect(html).toContain('aria-expanded="false"');
  });

  it('never cuts a long description: counts it near the limit and refuses it over', () => {
    const near = render(panel({ draft: 'x'.repeat(7000) }));
    expect(near).toContain('7,000 / 8,000');
    const over = render(panel({ draft: 'x'.repeat(8005) }));
    expect(over).toContain('5 characters too long');
    expect(over).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Generate diagram"/);
  });

  it('shows an attached text file as a chip, and counts its text towards the limit', () => {
    const html = render(
      panel({
        attachments: [
          { id: 'f1', kind: 'text', filename: 'flow.md', size: 2048, text: 'x'.repeat(7000) },
        ],
      }),
    );
    expect(html).toContain('flow.md');
    expect(html).toContain('2.0 KB');
    expect(html).toContain('aria-label="Remove file"');
    expect(html).toContain('7,000 / 8,000');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Generate diagram"/);
  });

  it('shows a PDF as a chip and says pictures and PDFs are not read yet', () => {
    const html = render(
      panel({
        draft: 'Draw this',
        attachments: [{ id: 'p1', kind: 'pdf', filename: 'spec.pdf', size: 4096, text: '' }],
      }),
    );
    expect(html).toContain('spec.pdf');
    expect(html).toContain('aren’t read yet');
  });

  it('puts actions and a time under each request and each diagram', () => {
    const html = render(
      panel({
        entries: [
          {
            id: 'e1',
            description: 'Sign in flow',
            chatId: 'c1',
            lines: [],
            createdAt: Date.now(),
            took: 4000,
            reaction: 'up',
          },
        ],
      }),
    );
    expect(html).toContain('aria-label="Ask again"');
    expect(html).toContain('aria-label="Edit"');
    expect(html).toContain('aria-label="Copy"');
    expect(html).toContain('aria-label="Copy as PNG"');
    expect(html).toMatch(/aria-label="Good diagram"[^>]*aria-pressed="true"/);
    expect(html).toContain('aria-label="Draw again"');
    expect(html).toContain('<time');
  });

  it('minimizes to a bar that says a diagram is being drawn and opens the panel again', () => {
    const html = renderToString(
      <DiagramPanel
        panel={panel({
          running: true,
          run: {
            description: 'Sign in flow',
            chatId: 'c1',
            detailed: false,
            lines: [],
            startedAt: Date.now(),
            fixing: 0,
            status: 'running',
          },
        })}
        theme="dark"
        canDraw
        onInsert={noop}
        onSignIn={noop}
        onUpgrade={noop}
        onClose={noop}
        minimized
        onMinimize={noop}
        onRestore={noop}
      />,
    );
    expect(html).toContain('data-testid="diagram-minimized"');
    expect(html).toContain('Drawing…');
    expect(html).toContain('aria-label="Open diagrams"');
    expect(html).toMatch(/<aside hidden=""/);
  });

  it('lists the board’s chats with their versions, and who is drawing with what is left', () => {
    const node = JSON.stringify({ t: 'node', id: 'a', kind: 'rectangle', text: 'A' });
    const html = renderToString(
      <DiagramPanel
        panel={panel({
          chat: 'c1',
          entries: [
            {
              id: 'a',
              chatId: 'c1',
              description: 'Sign in flow',
              lines: [node],
              createdAt: Date.now(),
              inserted: ['s1'],
            },
            {
              id: 'b',
              chatId: 'c1',
              changeOf: 'a',
              description: 'Add a reset step',
              lines: [node],
              createdAt: Date.now(),
            },
            { id: 'c', chatId: 'c2', description: 'Team chart', lines: [node], createdAt: 1 },
          ],
        })}
        theme="dark"
        canDraw
        onInsert={noop}
        onSignIn={noop}
        onUpgrade={noop}
        onClose={noop}
        profile={{ name: 'Ada Lovelace', avatarUrl: null }}
        boardShapeIds={new Set(['s1'])}
        onShowOnBoard={noop}
        onReplace={noop}
      />,
    );
    expect(html).toContain('New chat');
    expect(html).toContain('Team chart');
    expect(html).toContain('Generated');
    expect(html).toContain('Add a reset step');
    expect(html).toContain('On the board');
    expect(html).toContain('Replace v1 on the board');
    expect(html).toContain('Compare with v1');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Free');
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="7"/);
    // Only the chat on show is in the conversation.
    expect(html).toContain('id="diagram-b"');
    expect(html).not.toContain('id="diagram-c"');
  });

  it('shows a banner over the box past 85% of the month, with Upgrade on a smaller plan', () => {
    const low = render(
      panel({ usage: { plan: 'free', used: 9, limit: 10, resetsAt: '2026-11-01T00:00:00.000Z' } }),
    );
    expect(low).toContain('9 of 10 diagrams used this month');
    // The banner's own button, not the sidebar's.
    expect(low).toMatch(/mr-1\.5[^>]*>Upgrade to Pro/);
    expect(low).not.toContain('No tool picked');
    expect(low).toContain('aria-label="Dismiss"');
    const closed = render(
      panel({
        bannerClosed: true,
        usage: { plan: 'free', used: 9, limit: 10, resetsAt: '2026-11-01T00:00:00.000Z' },
      }),
    );
    expect(closed).not.toContain('diagrams used this month');

    const team = render(
      panel({
        usage: { plan: 'team', used: 180, limit: 200, resetsAt: '2026-11-01T00:00:00.000Z' },
      }),
    );
    expect(team).toContain('180 of 200 diagrams used this month');
    expect(team).not.toContain('Upgrade');

    const fine = render(panel());
    expect(fine).not.toContain('diagrams used this month');
  });

  it('offers the tools, and says what the picked one does above the box', () => {
    const none = render(panel());
    expect(none).toContain('Tools');
    expect(none).toContain('No tool picked');
    expect(none).toContain('Pick a tool');
    const detailed = render(panel({ detailed: true }));
    expect(detailed).toContain('Text to diagram');
    expect(detailed).toContain('plans the groups before it draws');
    expect(detailed).toContain('aria-label="Remove tool"');
    expect(detailed).toContain('Change');
  });

  it('words a failed diagram and offers to try again', () => {
    const html = render(
      panel({
        run: {
          description: 'Sign in flow',
          chatId: 'c1',
          detailed: false,
          lines: [],
          startedAt: 0,
          fixing: 0,
          status: 'failed',
          problem: 'busy',
        },
      }),
    );
    expect(html).toContain('Diagrams are busy right now');
    expect(html).toContain('Try again');
  });
});
