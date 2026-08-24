import { describe, expect, it } from 'vitest';
import { pointerCursorValue } from './pointer-cursor';

describe('pointerCursorValue', () => {
  it('escapes the # in a hex colour', () => {
    // Left raw, the # opens a URL fragment and the browser drops the cursor
    // back to the keyword without reporting anything.
    const value = pointerCursorValue('#F87171');

    expect(value).toContain('%23F87171');
    expect(value.slice(0, value.indexOf('")'))).not.toContain('#');
  });

  it('escapes the angle brackets of the markup', () => {
    const value = pointerCursorValue('#000000');

    expect(value).not.toContain('<');
    expect(value).not.toContain('>');
    expect(value).toContain('%3Csvg');
  });

  it('keeps the hotspot at the arrow tip and a keyword fallback', () => {
    expect(pointerCursorValue('#000000')).toMatch(/\) 0 0, default$/);
  });

  it('decodes back to the pointer artwork at the peer cursor size', () => {
    const value = pointerCursorValue('#DC2626');
    const encoded = value.slice(value.indexOf(',') + 1, value.indexOf('")'));
    const svg = decodeURIComponent(encoded);

    expect(svg).toContain("width='14'");
    expect(svg).toContain("viewBox='0 0 20 20'");
    expect(svg).toContain("fill='#DC2626'");
  });
});
