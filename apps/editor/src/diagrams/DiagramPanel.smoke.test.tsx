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
    changing: null,
    detailed: false,
    setDetailed: noop,
    startChange: noop,
    cancelChange: noop,
    generate: async () => {},
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
          detailed: false,
          lines: [],
          startedAt: Date.now(),
          fixing: 0,
          status: 'running',
        },
      }),
    );
    expect(reading).toContain('aria-label="Stop"');
    expect(reading).toContain('Reading your description');
    expect(reading).toContain('aria-label="Working"');

    const drawing = render(
      panel({
        running: true,
        run: {
          description: 'Sign in flow',
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
    expect(over).toMatch(/aria-label="Generate diagram"[^>]*disabled/);
  });

  it('offers Quick and Detailed, and greys Detailed out when too few are left', () => {
    const html = render(panel());
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('Detailed');
    const few = render(
      panel({ usage: { plan: 'free', used: 9, limit: 10, resetsAt: '2026-11-01T00:00:00.000Z' } }),
    );
    expect(few).toMatch(/aria-checked="false"[^>]*disabled/);
  });

  it('words a failed diagram and offers to try again', () => {
    const html = render(
      panel({
        run: {
          description: 'Sign in flow',
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
