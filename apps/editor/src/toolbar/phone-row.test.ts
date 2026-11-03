import { describe, expect, it } from 'vitest';
import { TOOLS } from '../tools/tool';
import { phoneRowTools } from './Toolbar';

const ALL = TOOLS.map((meta) => meta.id);

describe('phoneRowTools', () => {
  it('fills the width and keeps a slot for the overflow', () => {
    // 377px: eight slots of 44px inside the dock's frame, one for the chevron.
    const row = phoneRowTools(ALL, 377, null);
    expect(row).toHaveLength(7);
    expect(row.slice(0, 4)).toEqual(['select', 'hand', 'freehand', 'eraser']);
  });

  it('gives a narrower phone fewer tools', () => {
    expect(phoneRowTools(ALL, 359, null).length).toBeLessThan(phoneRowTools(ALL, 424, null).length);
  });

  it('keeps the tool last picked from the list in the final slot', () => {
    const row = phoneRowTools(ALL, 377, 'laser');
    expect(row).toHaveLength(7);
    expect(row[row.length - 1]).toBe('laser');
  });

  it('shows everything, with no overflow, when it all fits', () => {
    expect(phoneRowTools(['select', 'hand', 'laser'], 377, null)).toEqual([
      'select',
      'hand',
      'laser',
    ]);
  });

  it('never drops below the everyday handful', () => {
    expect(phoneRowTools(ALL, 100, null)).toHaveLength(4);
  });
});
