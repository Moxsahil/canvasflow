import { describe, expect, it } from 'vitest';
import { FONT_FAMILIES } from '../properties/palette';
import { FONT_CATALOG, findFont, firstFontName } from './font-catalog';

describe('FONT_CATALOG', () => {
  it('keeps the three stacks boards were always written with', () => {
    for (const legacy of FONT_FAMILIES) {
      expect(findFont(legacy.value)?.labelKey).toBe(legacy.labelKey);
    }
  });

  it('offers each stack once', () => {
    const values = FONT_CATALOG.map((font) => font.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('names every font', () => {
    for (const font of FONT_CATALOG) expect(font.name ?? font.labelKey).toBeTruthy();
  });
});

describe('firstFontName', () => {
  it('reads the first font of a stack, unquoted', () => {
    expect(firstFontName('"Comic Neue", cursive')).toBe('Comic Neue');
    expect(firstFontName('Georgia, serif')).toBe('Georgia');
  });
});
