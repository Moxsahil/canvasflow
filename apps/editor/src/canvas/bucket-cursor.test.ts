import { describe, expect, it } from 'vitest';
import { bucketCursorValue, eyedropperCursorValue } from './bucket-cursor';

const decode = (value: string) => decodeURIComponent(value);

describe('bucket cursors', () => {
  it('fills the drop with the colour it pours, and points with the drop', () => {
    const value = bucketCursorValue('#a5d8ff', false);
    expect(decode(value)).toContain("fill='#a5d8ff'");
    expect(value).toMatch(/\) 20 22, crosshair$/);
    // Left raw, a # would open a URL fragment and the cursor would be dropped.
    expect(value.slice(0, value.lastIndexOf(')'))).not.toContain('#');
  });

  it('inks each cursor for the board it is over', () => {
    expect(decode(bucketCursorValue('#a5d8ff', true))).toContain("stroke='#e3e3e8'");
    expect(decode(eyedropperCursorValue(false))).toContain("stroke='#1b1b1f'");
    expect(eyedropperCursorValue(true)).toMatch(/\) 2 22, crosshair$/);
  });
});
