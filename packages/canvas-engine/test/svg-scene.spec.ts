import { describe, expect, it } from 'vitest';
import { renderSceneToSvgString } from '../src/renderers/svg-scene';
import { EmptySceneError } from '../src/export/export-scene';
import { createRectangle } from '../src/shapes/rectangle';
import { createText } from '../src/shapes/text';
import { createArrow } from '../src/shapes/arrow';
import { createFreehand } from '../src/shapes/freehand';

const rect = (over: Partial<Parameters<typeof createRectangle>[0]> = {}) =>
  createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 50, seed: 1, ...over });

describe('renderSceneToSvgString', () => {
  it('produces a standalone svg sized to the content plus padding', () => {
    const svg = renderSceneToSvgString([rect()], { padding: 10 });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="120"');
    expect(svg).toContain('height="70"');
    expect(svg).toContain('viewBox="0 0 120 70"');
  });

  it('grows the declared size with scale but keeps the viewBox in world units', () => {
    // SVG is resolution-independent: 3× means a larger natural size, not more
    // pixels, so the geometry must not change.
    const svg = renderSceneToSvgString([rect()], { padding: 10, scale: 3 });
    expect(svg).toContain('width="360"');
    expect(svg).toContain('height="210"');
    expect(svg).toContain('viewBox="0 0 120 70"');
  });

  it('offsets content by its own bounds, wherever it sits in the world', () => {
    const near = renderSceneToSvgString([rect({ x: 0, y: 0 })], { padding: 10 });
    const far = renderSceneToSvgString([rect({ id: 'r1', x: 5000, y: -3000 })], { padding: 10 });
    expect(near).toContain('transform="translate(10 10)"');
    expect(far).toContain('transform="translate(-4990 3010)"');
    // Same drawing, same declared size — only the translate differs.
    expect(far).toContain('viewBox="0 0 120 70"');
  });

  it('paints a background rect only when asked', () => {
    expect(renderSceneToSvgString([rect()], { backgroundColor: '#fffce8' })).toContain(
      'fill="#fffce8"',
    );
    const transparent = renderSceneToSvgString([rect()]);
    expect(transparent).not.toContain('<rect x="0" y="0"');
  });

  it('draws a rectangle as stroked paths', () => {
    const svg = renderSceneToSvgString([rect({ strokeColor: '#e03131' })]);
    expect(svg).toContain('<path d="');
    expect(svg).toContain('stroke="#e03131"');
    expect(svg).toContain('fill="none"');
  });

  it('carries a hatched fill as its own path', () => {
    const svg = renderSceneToSvgString([rect({ fillColor: '#a5d8ff' })]);
    expect(svg).toContain('#a5d8ff');
  });

  it('expresses opacity as a group attribute', () => {
    const svg = renderSceneToSvgString([rect({ opacity: 50 })]);
    expect(svg).toContain('<g opacity="0.5">');
  });

  it('renders text as <text>, one element per line, escaping markup', () => {
    const svg = renderSceneToSvgString([
      createText({
        id: 't1',
        x: 5,
        y: 5,
        text: 'a < b & "c"\nsecond',
        fontSize: 20,
        textAlign: 'center',
        strokeColor: '#1e1e1e',
      }),
    ]);
    expect(svg).toContain('a &lt; b &amp; &quot;c&quot;');
    expect(svg).toContain('>second<');
    expect(svg).toContain('text-anchor="middle"');
    // Matches the canvas renderer's textBaseline = 'top'.
    expect(svg).toContain('dominant-baseline="text-before-edge"');
    // Second line one line-height down (20 * 1.2).
    expect(svg).toContain('y="29"');
  });

  it('adds arrowhead markers to an arrow', () => {
    const svg = renderSceneToSvgString([
      createArrow({
        id: 'a1',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [100, 0],
        ],
        endArrowhead: 'triangle',
        startArrowhead: 'circle',
        seed: 1,
      }),
    ]);
    expect(svg).toContain('<circle');
    // The filled triangle marker.
    expect(svg).toMatch(/<path d="M [^"]+ Z" fill="#/);
  });

  it('tapers a pressure-simulated freehand stroke segment by segment', () => {
    const svg = renderSceneToSvgString([
      createFreehand({
        id: 'f1',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [10, 10],
          [20, 0],
          [30, 10],
        ],
        simulatePressure: true,
        strokeWidth: 4,
        seed: 1,
      }),
    ]);
    const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    // Several different widths, none of them the flat nominal 4.
    expect(new Set(widths).size).toBeGreaterThan(1);
  });

  it('marks dashed strokes with a dash array', () => {
    const svg = renderSceneToSvgString([rect({ strokeStyle: 'dashed' })]);
    expect(svg).toContain('stroke-dasharray="');
  });

  it('refuses an empty scene', () => {
    expect(() => renderSceneToSvgString([])).toThrow(EmptySceneError);
  });
});
