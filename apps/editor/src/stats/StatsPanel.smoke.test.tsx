import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLine, createRectangle, type Shape } from '@canvasflow/canvas-engine';
import { StatsPanel } from './StatsPanel';

const noop = () => {};

// The strip measures itself in a layout effect, which a server render skips and
// warns about; the markup these tests read is complete without it.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((message: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string' && message.includes('useLayoutEffect does nothing')) return;
    consoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

const a = createRectangle({ id: 'a', x: 10, y: 20, width: 100, height: 50 });
const b = createRectangle({ id: 'b', x: 310, y: 220, width: 100, height: 50 });
const line = createLine({
  id: 'l',
  x: 0,
  y: 0,
  points: [
    [0, 0],
    [60, 40],
  ],
});

function render(shapes: Shape[], selected: Shape[] = [], readOnly = false): string {
  return renderToString(
    <StatsPanel
      shapes={shapes}
      selectedShapes={selected}
      readOnly={readOnly}
      boardWidth={1600}
      onEdit={noop}
      onEditEnd={noop}
      onClose={noop}
    />,
  );
}

/** The strip's groups, by name, in the order they are drawn. */
function groups(html: string): string[] {
  return [...html.matchAll(/role="group" aria-label="([^"]+)"/g)].map((match) => match[1]!);
}

/** The element named `name`, from its opening tag on, attribute order aside. */
function field(html: string, name: string): string {
  return html.split('<').find((part) => part.includes(`aria-label="${name}"`)) ?? '';
}

/** What the read-only value named `name` says. */
function readout(html: string, name: string): string {
  return field(html, name).replace(/^[^>]*>/, '');
}

describe('StatsPanel', () => {
  it('says how much is on the board and how far it reaches', () => {
    const html = render([a, b]);

    expect(groups(html)).toEqual(['Canvas']);
    expect(readout(html, 'Shapes')).toBe('2');
    expect(readout(html, 'Width')).toBe('400');
    expect(readout(html, 'Height')).toBe('250');
    expect(html).toContain('shapes');
  });

  it('sets its own ink for both themes, rather than taking the page’s', () => {
    // The surface comes from the dock's tokens, which carry no text colour.
    // Left to inherit, the numbers are dark on a dark bar in the dark theme.
    const root = render([a]).split('>')[0]!;

    expect(root).toContain('data-testid="stats-panel"');
    expect(root).toMatch(/\btext-neutral-950\b/);
    expect(root).toMatch(/\bdark:text-neutral-50\b/);
  });

  it('counts one shape as one shape', () => {
    const html = render([a]);

    expect(html).toMatch(/>shape</);
    expect(html).not.toMatch(/>shapes</);
  });

  it('adds the selection after the totals, as fields that can be typed into', () => {
    const html = render([a, b], [a]);

    expect(groups(html)).toEqual(['Canvas', 'Selection']);
    expect(html).toContain('>Rectangle<');
    expect(field(html, 'X position')).toMatch(/^input[^>]*value="10"/);
    expect(field(html, 'Y position')).toMatch(/^input[^>]*value="20"/);
    // The selection's own width, after the board's.
    expect(html.split('aria-label="Width"')[2]).toMatch(/value="100"/);
    expect(html.split('aria-label="Height"')[2]).toMatch(/value="50"/);
  });

  it('leaves out the font size when no text is selected', () => {
    expect(render([a], [a])).not.toContain('aria-label="Font size"');
  });

  it('counts several shapes and marks what they do not share', () => {
    const html = render([a, b], [a, b]);

    expect(html).toContain('>2 shapes<');
    expect(field(html, 'X position')).toContain('value="Mixed"');
    expect(html.split('aria-label="Width"')[2]).toMatch(/value="100"/);
  });

  it('shows the size of a line without offering to change it', () => {
    const html = render([line], [line]);

    expect(field(html, 'X position')).toMatch(/^input/);
    expect(html).not.toMatch(/<input[^>]*aria-label="Width"/);
    expect(html).not.toMatch(/<input[^>]*aria-label="Height"/);
  });

  it('gives a viewer the numbers and no way to change them', () => {
    const html = render([a], [a], true);

    expect(html).not.toContain('<input');
    expect(readout(html, 'X position')).toBe('10');
  });
});
