import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Shape } from '@canvasflow/canvas-engine';
import { DEFAULT_ITEM_STYLE, type ItemStyle } from '../machine/tool-machine.types';
import { StyleHalo } from './StyleHalo';

const noop = () => {};

// The bar measures itself in a layout effect, which a server render skips and
// warns about; the markup these tests read is complete without it.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((message: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string' && message.includes('useLayoutEffect does nothing')) return;
    consoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

function render(
  shapeKinds: Shape['kind'][],
  style: Partial<ItemStyle> = {},
  options: { canReorder?: boolean; hidden?: boolean } = {},
): string {
  return renderToString(
    <StyleHalo
      style={{ ...DEFAULT_ITEM_STYLE, ...style }}
      shapeKinds={shapeKinds}
      canReorder={options.canReorder ?? true}
      onStyleChange={noop}
      layerActions={{
        onSendToBack: noop,
        onSendBackward: noop,
        onBringForward: noop,
        onBringToFront: noop,
      }}
      darkMode={false}
      anchor={{ x: 400, y: 300, width: 200, height: 100 }}
      board={{ width: 1200, height: 800 }}
      hidden={options.hidden ?? false}
    />,
  );
}

/** The chips on the bar, by the name each is announced with (values dropped). */
function chips(html: string): string[] {
  const bar = html.slice(html.indexOf('data-testid="style-halo"'));
  return [...bar.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map(
    (match) => match[1]!.split(':')[0]!,
  );
}

describe('StyleHalo', () => {
  it('gives a rectangle its colours, line, look, corners, opacity and arrange', () => {
    expect(chips(render(['rectangle']))).toEqual([
      'Stroke colour',
      'Fill colour',
      'Line',
      'Look',
      'Rounded corners',
      'Opacity',
      'Arrange',
    ]);
  });

  it('gives text a text colour and its own chip, and none of the line ones', () => {
    expect(chips(render(['text']))).toEqual(['Text colour', 'Text style', 'Opacity', 'Arrange']);
  });

  it('gives an arrow its own chip, and no fill', () => {
    expect(chips(render(['arrow']))).toEqual([
      'Stroke colour',
      'Line',
      'Look',
      'Arrow',
      'Opacity',
      'Arrange',
    ]);
  });

  it('gives a hand-drawn stroke no look to choose', () => {
    expect(chips(render(['freehand']))).toEqual([
      'Stroke colour',
      'Fill colour',
      'Line',
      'Opacity',
      'Arrange',
    ]);
  });

  it('marks the corners chip pressed while corners are round', () => {
    const html = render(['rectangle'], { edges: 'round' });
    const tag = html.split('<').find((part) => part.includes('aria-label="Rounded corners"')) ?? '';
    expect(tag).toContain('aria-pressed="true"');
  });

  it('reads out the opacity on its chip', () => {
    expect(render(['rectangle'], { opacity: 60 })).toContain('aria-label="Opacity: 60%"');
  });

  it('offers arranging only when one shape is selected', () => {
    expect(chips(render(['rectangle'], {}, { canReorder: false }))).not.toContain('Arrange');
  });

  it('draws nothing while hidden', () => {
    expect(render(['rectangle'], {}, { hidden: true })).toBe('');
  });
});
