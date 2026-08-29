import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GlassDock } from '@/components/ui/glass-dock';
import { Toolbar } from './Toolbar';
import { TOOLS } from '../tools/tool';

const noop = () => {};

function render(props: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  return renderToString(
    <GlassDock aria-label="Editor dock">
      <Toolbar activeTool="select" onToolChange={noop} {...props} />
    </GlassDock>,
  );
}

/** The opening tag of the element carrying this test id, attribute order aside. */
function tagFor(html: string, testId: string): string {
  const marker = `data-testid="${testId}"`;
  const index = html.indexOf(marker);
  if (index === -1) return '';
  return html.slice(html.lastIndexOf('<', index), html.indexOf('>', index) + 1);
}

describe('Toolbar', () => {
  it('keeps the overflow tools out of the row', () => {
    const html = render();

    // The row is fixed furniture and every tool in it makes the board
    // smaller, which is the whole reason the overflow exists.
    for (const meta of TOOLS.filter((t) => t.overflow)) {
      expect(html).not.toContain(`data-testid="toolbar-${meta.id}"`);
    }
    expect(html).toContain('data-testid="toolbar-overflow"');
  });

  it('still shows the tools that earn a permanent slot', () => {
    const html = render();

    for (const meta of TOOLS.filter((t) => !t.overflow)) {
      expect(html).toContain(`data-testid="toolbar-${meta.id}"`);
    }
  });

  it('puts the overflow control last', () => {
    const html = render();
    const lastRowTool = [...TOOLS].reverse().find((t) => !t.overflow)!;

    expect(html.indexOf('data-testid="toolbar-overflow"')).toBeGreaterThan(
      html.indexOf(`data-testid="toolbar-${lastRowTool.id}"`),
    );
  });

  it('marks the chevron when the tool in use is one of the ones behind it', () => {
    // Otherwise picking the laser leaves the row showing nothing selected,
    // and the toolbar looks like it has forgotten what you chose.
    expect(tagFor(render({ activeTool: 'laser' }), 'toolbar-overflow')).toContain('data-active');
    expect(tagFor(render({ activeTool: 'select' }), 'toolbar-overflow')).not.toContain(
      'data-active',
    );
  });

  it('drops the chevron when a viewer is left with one tool behind it', () => {
    // A viewer keeps the laser and nothing else from the overflow, and one
    // item behind a chevron is worse than one more button in the row.
    const html = render({ readOnly: true });

    expect(html).not.toContain('data-testid="toolbar-overflow"');
    expect(html).toContain('data-testid="toolbar-laser"');
  });
});
