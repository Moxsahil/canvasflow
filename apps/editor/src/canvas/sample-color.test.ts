import { describe, expect, it } from 'vitest';
import { isDarkColor, pixelOverGround } from './sample-color';

describe('pixelOverGround', () => {
  it('reads an opaque pixel as itself', () => {
    expect(pixelOverGround([178, 242, 187, 255], '#fafaf9')).toBe('#b2f2bb');
  });

  it('reads an empty pixel as the board beneath it', () => {
    expect(pixelOverGround([0, 0, 0, 0], '#181818')).toBe('#181818');
  });

  it('reads a half-faded pixel as the blend that shows', () => {
    expect(pixelOverGround([0, 0, 0, 128], '#ffffff')).toBe('#7f7f7f');
  });
});

describe('isDarkColor', () => {
  it('tells a dark colour from a light one', () => {
    expect(isDarkColor('#1e1e1e')).toBe(true);
    expect(isDarkColor('#ffec99')).toBe(false);
  });
});
