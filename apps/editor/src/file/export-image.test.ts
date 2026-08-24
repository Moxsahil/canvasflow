import { describe, expect, it } from 'vitest';
import { createRectangle } from '@canvasflow/canvas-engine';
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
  it('leaves the background rect outside the dark filter', () => {
    const svg = exportSvgString(shapes, settings({ dark: true }));

    // The rect must come before the filtered group, and carry no filter of its
    // own — the board's colour is chosen per theme, so inverting it here would
    // export a colour the editor never shows.
    const rect = svg.indexOf('<rect');
    const filtered = svg.indexOf('style="filter:');

    expect(rect).toBeGreaterThan(-1);
    expect(filtered).toBeGreaterThan(rect);
    expect(svg).toContain('fill="#181818"');
  });

  it('puts the dark filter on the shape group, not the root svg', () => {
    const svg = exportSvgString(shapes, settings({ dark: true }));

    expect(svg).toContain('<g style="filter: invert(93%) hue-rotate(180deg)" transform=');
    expect(svg).not.toContain('<svg style="filter:');
  });

  it('applies no filter in light mode', () => {
    const svg = exportSvgString(shapes, settings({ dark: false }));

    expect(svg).not.toContain('filter:');
    expect(svg).toContain('fill="#181818"');
  });

  it('omits the background rect when the background is off', () => {
    const svg = exportSvgString(shapes, settings({ dark: true, withBackground: false }));

    expect(svg).not.toContain('<rect');
    expect(svg).toContain('<g style="filter:');
  });
});
