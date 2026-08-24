import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ZoomPanel } from './ZoomPanel';

const noop = () => {};

function render(props: Partial<Parameters<typeof ZoomPanel>[0]> = {}) {
  return renderToString(
    <TooltipProvider>
      <ZoomPanel
        zoom={1}
        syncStatus="connected"
        theme="dark"
        onThemeChange={noop}
        canZoomToFit
        onZoomIn={noop}
        onZoomOut={noop}
        onResetZoom={noop}
        onZoomToFit={noop}
        {...props}
      />
    </TooltipProvider>,
  );
}

/** The opening tag of the `<button>` carrying `aria-label`, attribute order aside. */
function buttonTag(html: string, label: string): string {
  const tag = html
    .split('<button')
    .map((part) => part.slice(0, part.indexOf('>')))
    .find((part) => part.includes(`aria-label="${label}"`));
  return tag ?? '';
}

describe('ZoomPanel smoke', () => {
  it('renders a toolbar with the zoom readout', () => {
    const html = render();
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('100%');
  });

  it('marks the active theme pressed', () => {
    const html = render({ theme: 'dark' });
    expect(buttonTag(html, 'Dark mode')).toContain('aria-pressed="true"');
    expect(buttonTag(html, 'Light mode')).toContain('aria-pressed="false"');
  });

  it('orients separators vertically inside a horizontal toolbar', () => {
    expect(render()).toContain('data-orientation="vertical"');
  });

  it('disables zoom out at the minimum and zoom in at the maximum', () => {
    expect(buttonTag(render({ zoom: 0.1 }), 'Zoom out')).toContain('disabled=""');
    expect(buttonTag(render({ zoom: 5 }), 'Zoom in')).toContain('disabled=""');
    expect(buttonTag(render({ zoom: 1 }), 'Zoom out')).not.toContain('disabled=""');
    expect(buttonTag(render({ zoom: 1 }), 'Zoom in')).not.toContain('disabled=""');
  });

  it('disables fit on an empty board', () => {
    expect(buttonTag(render({ canZoomToFit: false }), 'Zoom to fit all shapes')).toContain(
      'disabled=""',
    );
  });
});
