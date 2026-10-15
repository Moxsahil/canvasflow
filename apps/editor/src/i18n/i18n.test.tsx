import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { rich } from './rich';
import {
  availableLocales,
  ENGLISH,
  initialLocale,
  listedLanguages,
  loadMessages,
  matchLocale,
  translate,
  type Messages,
} from './i18n';
import { DEFAULT_LOCALE, LANGUAGES, TEST_LOCALE, TEST_RTL_LOCALE } from './languages';

describe('LANGUAGES', () => {
  it('lists English, and no language twice', () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(codes).toContain(DEFAULT_LOCALE);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('can switch to every translated language it has a file for', () => {
    const listed = listedLanguages(false).map((language) => language.code);
    expect(availableLocales(false).filter((code) => !listed.includes(code))).toEqual([]);
  });

  it('offers the test languages only in development', () => {
    expect(availableLocales(false)).not.toContain(TEST_LOCALE);
    expect(availableLocales(true)).toEqual(expect.arrayContaining([TEST_LOCALE, TEST_RTL_LOCALE]));
    expect(listedLanguages(false).map((language) => language.code)).not.toContain(TEST_LOCALE);
  });
});

describe('translate', () => {
  const english = { 'menu.language': 'Language' } as Messages;

  it("uses the language's own word", () => {
    expect(translate({ 'menu.language': 'Idioma' }, 'es', 'menu.language')).toBe('Idioma');
  });

  it('falls back to English for a word not translated yet', () => {
    expect(translate({}, 'es', 'menu.language')).toBe(ENGLISH['menu.language']);
  });

  it('fills every {{slot}}, as often as it appears', () => {
    const messages = { 'menu.language': '{{n}} of {{total}}, {{n}} again' } as Messages;
    expect(translate(messages, 'en', 'menu.language', { n: 2, total: 5 })).toBe('2 of 5, 2 again');
  });

  it('shows the key itself in the test languages', () => {
    expect(translate(english, TEST_LOCALE, 'menu.language')).toContain('[[menu.language]]');
    expect(translate(english, TEST_RTL_LOCALE, 'menu.language', { n: 1 })).toContain(
      '[[menu.language(n)]]',
    );
  });
});

describe('counted words', () => {
  it('take the form the count asks for', () => {
    expect(translate(ENGLISH, 'en', 'boards.count', { count: 1 })).toBe('1 board');
    expect(translate(ENGLISH, 'en', 'boards.count', { count: 0 })).toBe('0 boards');
    expect(translate(ENGLISH, 'en', 'boards.count', { count: 4 })).toBe('4 boards');
  });

  it("use the language's own forms, and English's when it has none", () => {
    const polish = {
      'boards.count_one': '{{count}} tablica',
      'boards.count_few': '{{count}} tablice',
      'boards.count_other': '{{count}} tablic',
    } as Messages;
    expect(translate(polish, 'pl', 'boards.count', { count: 3 })).toBe('3 tablice');
    expect(translate(polish, 'pl', 'boards.count', { count: 5 })).toBe('5 tablic');
    expect(translate({}, 'pl', 'boards.count', { count: 5 })).toBe('5 boards');
  });
});

describe('rich', () => {
  it('puts an element where its slot is, wherever the language puts it', () => {
    const html = renderToString(<>{rich('Type {{name}} to confirm', { name: <b>Ada</b> })}</>);
    expect(html).toBe('Type <b>Ada</b> to confirm');
  });
});

describe('matchLocale', () => {
  const available = ['en', 'es', 'pt-BR', 'zh-CN'];

  it('takes an exact match, whatever its case', () => {
    expect(matchLocale(['zh-cn'], available)).toBe('zh-CN');
  });

  it('settles for the same language in another region', () => {
    expect(matchLocale(['pt-PT'], available)).toBe('pt-BR');
    expect(matchLocale(['zh'], available)).toBe('zh-CN');
    expect(matchLocale(['es-MX'], available)).toBe('es');
  });

  it("goes down the browser's list in order", () => {
    expect(matchLocale(['nl-NL', 'es-ES', 'en-US'], available)).toBe('es');
  });

  it('falls back to English when nothing matches', () => {
    expect(matchLocale(['nl', 'sv'], available)).toBe(DEFAULT_LOCALE);
    expect(matchLocale([], available)).toBe(DEFAULT_LOCALE);
  });

  it('never lands on a test language by accident', () => {
    expect(matchLocale(['te-IN'], ['en', TEST_LOCALE])).toBe(DEFAULT_LOCALE);
  });
});

describe('initialLocale', () => {
  it('keeps the choice made in this browser', () => {
    expect(initialLocale('es', ['fr'], ['en', 'es', 'fr'])).toBe('es');
  });

  it('works it out again when the stored choice is gone', () => {
    expect(initialLocale('es', ['fr'], ['en', 'fr'])).toBe('fr');
    expect(initialLocale(null, ['fr-CA'], ['en', 'fr'])).toBe('fr');
  });
});

describe('loadMessages', () => {
  it('needs no fetch for English or the test languages', async () => {
    expect(await loadMessages('en')).toBe(ENGLISH);
    expect(await loadMessages(TEST_LOCALE)).toBe(ENGLISH);
  });

  it('falls back to English for a language with no file', async () => {
    expect(await loadMessages('xx')).toBe(ENGLISH);
  });
});
