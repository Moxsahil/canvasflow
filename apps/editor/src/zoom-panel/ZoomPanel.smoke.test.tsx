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
        canvasWidth={1400}
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

  it('makes the readout itself the reset control', () => {
    const html = render({ zoom: 2 });
    // Reset has no button of its own any more, so the percentage has to be the
    // thing that carries both the label and the reading.
    expect(buttonTag(html, 'Reset zoom to 100%, currently 200%')).not.toBe('');
    expect(html).toContain('>200%</button>');
  });

  it('leaves the theme picker to the sidebar', () => {
    const html = render();
    expect(html).not.toContain('Light mode');
    expect(html).not.toContain('Dark mode');
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

  it('disables fit on an empty board but leaves the readout pressable', () => {
    const empty = render({ canZoomToFit: false });
    expect(buttonTag(empty, 'Zoom to fit all shapes')).toContain('disabled=""');
    expect(buttonTag(empty, 'Reset zoom to 100%, currently 100%')).not.toContain('disabled=""');
  });

  it('sheds everything but the readout on a canvas too narrow for the row', () => {
    const tight = render({ canvasWidth: 900 });
    expect(buttonTag(tight, 'Reset zoom to 100%, currently 100%')).not.toBe('');
    expect(tight).not.toContain('Zoom to fit all shapes');
    expect(tight).not.toContain('aria-label="Zoom in"');
    expect(tight).not.toContain('aria-label="Zoom out"');
  });

  it('keeps the whole row while the canvas has room for it', () => {
    const roomy = render({ canvasWidth: 1200 });
    expect(buttonTag(roomy, 'Zoom to fit all shapes')).not.toBe('');
    expect(buttonTag(roomy, 'Zoom in')).not.toBe('');
    expect(buttonTag(roomy, 'Zoom out')).not.toBe('');
  });

  it('leaves the narrowest canvases to the dock alone', () => {
    expect(render({ canvasWidth: 800 })).toBe('');
  });
});
