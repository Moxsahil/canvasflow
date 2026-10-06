import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Shape } from '@canvasflow/canvas-engine';
import { DEFAULT_ITEM_STYLE, type ItemStyle } from '../machine/tool-machine.types';
import { PropertiesPanel } from './PropertiesPanel';

const noop = () => {};
const layerActions = {
  onSendToBack: noop,
  onSendBackward: noop,
  onBringForward: noop,
  onBringToFront: noop,
};

function render(
  shapeKinds: Shape['kind'][],
  style: Partial<ItemStyle> = {},
  canReorder = true,
): string {
  return renderToString(
    <PropertiesPanel
      style={{ ...DEFAULT_ITEM_STYLE, ...style }}
      shapeKinds={shapeKinds}
      canReorder={canReorder}
      onStyleChange={noop}
      layerActions={layerActions}
      darkMode={false}
    />,
  );
}

/** The panel's sections, by name, in the order they are drawn. */
function sections(html: string): string[] {
  return [...html.matchAll(/<section aria-label="([^"]+)"/g)].map((match) => match[1]!);
}

/** The opening tag of the control labelled `label`, attribute order aside. */
function tagLabelled(html: string, label: string): string {
  return (
    html
      .split('<')
      .find((part) => part.includes(`aria-label="${label}"`))
      ?.slice(0, 400) ?? ''
  );
}

describe('PropertiesPanel', () => {
  it('gives a rectangle its stroke, fill, shape and layer sections', () => {
    expect(sections(render(['rectangle']))).toEqual(['Stroke', 'Fill', 'Shape', 'Layer']);
  });

  it('gives text its own section, and none of the shape ones', () => {
    const html = render(['text']);
    expect(sections(html)).toEqual(['Text', 'Layer']);
    expect(html).toContain('aria-label="Font size"');
    expect(html).toContain('aria-label="Text colour: ');
  });

  it('gives an arrow its type and both ends, and no fill', () => {
    const html = render(['arrow'], { startArrowhead: 'none', endArrowhead: 'triangle' });
    expect(sections(html)).toEqual(['Stroke', 'Shape', 'Arrow', 'Layer']);
    expect(html).toContain('aria-label="Start arrowhead: None"');
    expect(html).toContain('aria-label="End arrowhead: Triangle"');
  });

  it('gives a hand-drawn stroke pressure instead of dashes and a look', () => {
    const html = render(['freehand']);
    expect(html).toContain('aria-label="Pressure"');
    expect(html).not.toContain('aria-label="Stroke dash"');
    expect(html).not.toContain('aria-label="Look"');
  });

  it('falls back to what a mixed selection shares', () => {
    // A rectangle has a fill; an arrow does not, so the pair shows none.
    expect(sections(render(['rectangle', 'arrow']))).toEqual(['Stroke', 'Shape', 'Layer']);
  });

  it('marks the choice in effect in each segmented control', () => {
    const html = render(['rectangle'], { strokeStyle: 'dashed', edges: 'round' });
    expect(tagLabelled(html, 'Dashed')).toContain('aria-checked="true"');
    expect(tagLabelled(html, 'Solid')).toContain('aria-checked="false"');
    expect(tagLabelled(html, 'Round')).toContain('aria-checked="true"');
  });

  it('shows no fill as None, and hides the pattern until there is a fill to hatch', () => {
    const empty = render(['rectangle'], { fillColor: null });
    expect(empty).toContain('aria-label="Fill colour: none"');
    expect(empty).not.toContain('aria-label="Fill pattern"');

    const filled = render(['rectangle'], { fillColor: '#a5d8ff' });
    expect(filled).toContain('aria-label="Fill pattern"');
  });

  it('writes the stroke weight out, and stops the stepper at either end', () => {
    const thinnest = render(['rectangle'], { strokeWidth: 1 });
    expect(thinnest).toContain('1 px');
    expect(tagLabelled(thinnest, 'Thinner')).toContain('disabled=""');
    expect(tagLabelled(thinnest, 'Thicker')).not.toContain('disabled=""');
  });

  it('offers arranging only when one shape is selected', () => {
    expect(render(['rectangle'], {}, true)).toContain('aria-label="Bring to front"');
    expect(render(['rectangle'], {}, false)).not.toContain('aria-label="Bring to front"');
  });
});

describe('words written in shapes', () => {
  it('adds a Text section, after the shape’s own, for shapes that have words', () => {
    const html = renderToString(
      <PropertiesPanel
        style={DEFAULT_ITEM_STYLE}
        shapeKinds={['rectangle']}
        canReorder
        onStyleChange={noop}
        layerActions={layerActions}
        darkMode={false}
        hasText
      />,
    );
    const drawn = sections(html);
    expect(drawn).toContain('Text');
    expect(drawn).toContain('Stroke');
    expect(drawn.indexOf('Text')).toBeGreaterThan(drawn.indexOf('Stroke'));
    expect(sections(render(['rectangle']))).not.toContain('Text');
  });
});
