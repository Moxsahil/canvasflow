import { describe, it, expect } from 'vitest';
import { hexToHsv, hsvToHex, hsvToRgb, parseHex, rgbToHex, rgbToHsv } from './hsv';

describe('parseHex', () => {
  it('accepts six digits with and without a hash', () => {
    expect(parseHex('#1971c2')).toEqual({ r: 0x19, g: 0x71, b: 0xc2 });
    expect(parseHex('1971c2')).toEqual({ r: 0x19, g: 0x71, b: 0xc2 });
  });

  it('expands three-digit shorthand', () => {
    expect(parseHex('#f0a')).toEqual({ r: 255, g: 0, b: 0xaa });
  });

  it('rejects malformed input', () => {
    expect(parseHex('')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('#nothex')).toBeNull();
  });
});

describe('hsv round-trip', () => {
  it.each(['#000000', '#ffffff', '#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#a5d8ff'])(
    'survives hex → hsv → hex for %s',
    (hex) => {
      const hsv = hexToHsv(hex);
      expect(hsv).not.toBeNull();
      expect(hsvToHex(hsv!)).toBe(hex);
    },
  );

  it('keeps rgb stable through hsv', () => {
    for (const rgb of [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 12, g: 200, b: 87 },
      { r: 7, g: 7, b: 7 },
    ]) {
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
    }
  });
});

describe('hsvToRgb', () => {
  it('places the primaries at the expected angles', () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe('#0000ff');
  });

  it('wraps hue past 360 and below 0', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000');
    expect(hsvToHex({ h: 480, s: 1, v: 1 })).toBe(hsvToHex({ h: 120, s: 1, v: 1 }));
    expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe(hsvToHex({ h: 240, s: 1, v: 1 }));
  });

  it('is white at the centre and black at zero value', () => {
    expect(hsvToHex({ h: 200, s: 0, v: 1 })).toBe('#ffffff');
    expect(hsvToHex({ h: 200, s: 1, v: 0 })).toBe('#000000');
  });
});

describe('rgbToHex', () => {
  it('pads single digits and clamps out-of-range channels', () => {
    expect(rgbToHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
    expect(rgbToHex({ r: -20, g: 300, b: 128 })).toBe('#00ff80');
  });
});
