import { describe, expect, it } from 'vitest';
import { createRectangle, DARK_INK_COLOR, DEFAULT_STROKE_COLOR } from '@canvasflow/canvas-engine';
import { exportSvgString, type ImageExportSettings } from './export-image';

const shapes = [createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80 })];

const settings = (overrides: Partial<ImageExportSettings> = {}): ImageExportSettings => ({
  embedScene: false,
  scale: 1,
  withBackground: true,
  dark: false,
  backgroundColor: '#181818',
  ...overrides,
});

describe('exportSvgString', () => {
  it("paints the board's own colour behind the drawing, unaltered", () => {
    const svg = exportSvgString(shapes, settings({ dark: true }));

    // The board colour is chosen per theme, so it lands in the file exactly as
    // the editor shows it.
    expect(svg).toContain('fill="#181818"');
  });

  it('exports the default stroke as ink on a dark board', () => {
    const dark = exportSvgString(shapes, settings({ dark: true }));

    expect(dark).toContain(DARK_INK_COLOR);
    expect(dark).not.toContain(DEFAULT_STROKE_COLOR);
  });

  it('keeps a chosen colour identical in both themes', () => {
    const red = [
      createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 80, strokeColor: '#e03131' }),
    ];

    expect(exportSvgString(red, settings({ dark: false }))).toContain('#e03131');
    expect(exportSvgString(red, settings({ dark: true }))).toContain('#e03131');
  });

  it('never resorts to a filter, in either theme', () => {
    // Dark is a colour decision per shape now, so a viewer that ignores CSS
    // filters still sees the export the editor promised.
    expect(exportSvgString(shapes, settings({ dark: false }))).not.toContain('filter:');
    expect(exportSvgString(shapes, settings({ dark: true }))).not.toContain('filter:');
  });

  it('omits the background rect when the background is off', () => {
    const svg = exportSvgString(shapes, settings({ dark: true, withBackground: false }));

    expect(svg).not.toContain('<rect');
  });
});
