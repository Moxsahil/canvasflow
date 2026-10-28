import en from './locales/en.json';
import {
  DEFAULT_LOCALE,
  isTestLocale,
  LANGUAGES,
  TEST_LANGUAGES,
  type Language,
} from './languages';

/** Every word the editor has, by the key components ask for it with. en.json is the full set. */
export type TranslationKey = keyof typeof en;

/**
 * One language's words. Any of them may be missing — a language is shipped
 * before every word is translated, and the English one shows in its place.
 */
export type Messages = Readonly<Partial<Record<TranslationKey, string>>>;

/** Values for the `{{name}}` slots in a word. */
export type TranslationValues = Readonly<Record<string, string | number>>;

export const ENGLISH: Messages = en;

/**
 * The other languages' files, each fetched only when someone picks it, so a
 * board never downloads words it won't show. English is left out: it is part
 * of the app itself, as the fallback for everything else.
 */
const LOADERS = import.meta.glob<Messages>(['./locales/*.json', '!./locales/en.json'], {
  import: 'default',
});

function codeOfFile(path: string): string {
  return path.slice('./locales/'.length, -'.json'.length);
}

const TRANSLATED = Object.keys(LOADERS).map(codeOfFile);

/** The languages the menu lists — the made-up test ones too, but only in development. */
export function listedLanguages(dev: boolean = import.meta.env.DEV): readonly Language[] {
  return dev ? [...LANGUAGES, ...TEST_LANGUAGES] : LANGUAGES;
}

/** The languages that can actually be switched to: English, any with a file, and in development the test ones. */
export function availableLocales(dev: boolean = import.meta.env.DEV): readonly string[] {
  const codes = [DEFAULT_LOCALE, ...TRANSLATED];
  return dev ? [...codes, ...TEST_LANGUAGES.map((language) => language.code)] : codes;
}

export function findLanguage(code: string): Language | undefined {
  return [...LANGUAGES, ...TEST_LANGUAGES].find((language) => language.code === code);
}

/**
 * A word whose form depends on a number. Its forms sit in en.json under the
 * key plus `_one`, `_other` and whatever else a language needs (`_few`,
 * `_many`…), and it is asked for by the key alone with a `count`.
 */
type PluralKey<K> = K extends `${infer Base}_other` ? Base : never;

/** Anything `t()` takes: a plain word's key, or a counted word's key without its form. */
export type WordKey = TranslationKey | PluralKey<TranslationKey>;

function lookup(
  messages: Messages,
  locale: string,
  key: string,
  count: unknown,
): string | undefined {
  const words = messages as Readonly<Record<string, string | undefined>>;
  if (typeof count === 'number') {
    const form = new Intl.PluralRules(locale).select(count);
    return words[`${key}_${form}`] ?? words[`${key}_other`] ?? words[key];
  }
  return words[key];
}

export function translate(
  messages: Messages,
  locale: string,
  key: WordKey,
  values?: TranslationValues,
): string {
  if (isTestLocale(locale)) {
    const slots = values ? `(${Object.keys(values).join(', ')})` : '';
    // Isolated, so a bracketed key keeps its own direction inside the
    // right-to-left test language instead of having its brackets flipped.
    return `\u2068[[${key}${slots}]]\u2069`;
  }

  const count = values?.count;
  let text =
    lookup(messages, locale, key, count) ?? lookup(ENGLISH, DEFAULT_LOCALE, key, count) ?? key;
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return text;
}

let current: { locale: string; messages: Messages } = {
  locale: DEFAULT_LOCALE,
  messages: ENGLISH,
};

/** Called by the provider as each language arrives, so `t` below follows it. */
export function setCurrentLanguage(locale: string, messages: Messages): void {
  current = { locale, messages };
}

/**
 * The locale to format dates and numbers in: the browser's own, while it is
 * the language on screen — so someone in Britain keeps day-before-month — and
 * otherwise the language on screen.
 */
export function formatLocale(): string {
  const lang = isTestLocale(current.locale) ? DEFAULT_LOCALE : current.locale;
  return browserLocales().find((code) => languagePart(code) === languagePart(lang)) ?? lang;
}

/**
 * Spelled out rather than taken from Intl in English: the short month names
 * differ between ICU versions ("Sep" in one, "Sept" in the next), so the same
 * date would read differently in different browsers.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "24 Sep 2026" in English, and the language's own short date otherwise. */
export function formatShortDate(date: Date): string {
  const locale = formatLocale();
  if (languagePart(locale) === DEFAULT_LOCALE) {
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The lookup for code outside components — command lists, error messages,
 * anything worked out when it is called rather than rendered. Components use
 * `useT()` instead, which re-renders them when the language changes.
 */
export function t(key: WordKey, values?: TranslationValues): string {
  return translate(current.messages, current.locale, key, values);
}

/** "Ada", "Ada and Grace", "Ada, Grace and Linus". */
export function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return t('common.listAnd', {
    rest: names.slice(0, -1).join(', '),
    last: names[names.length - 1]!,
  });
}

function languagePart(code: string): string {
  return code.split('-')[0]!.toLowerCase();
}

/**
 * The first of the browser's languages this app can show.
 *
 * An exact match wins, then one on the language alone, so someone whose
 * browser asks for `pt-PT` still gets Portuguese rather than English, and one
 * asking for plain `zh` gets the Chinese there is.
 */
export function matchLocale(preferred: readonly string[], available: readonly string[]): string {
  for (const wanted of preferred) {
    const exact = available.find((code) => code.toLowerCase() === wanted.toLowerCase());
    if (exact) return exact;

    const sameLanguage = available.find(
      (code) => !isTestLocale(code) && languagePart(code) === languagePart(wanted),
    );
    if (sameLanguage) return sameLanguage;
  }
  return DEFAULT_LOCALE;
}

/**
 * The language to start in: the one chosen in this browser, while the app
 * still has it, and otherwise the closest the browser asks for.
 */
export function initialLocale(
  stored: string | null,
  preferred: readonly string[],
  available: readonly string[],
): string {
  if (stored && available.includes(stored)) return stored;
  return matchLocale(preferred, available);
}

export const LOCALE_STORAGE_KEY = 'cf:locale';

export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Only a choice made in the menu is stored. A language picked from the
 * browser's list is worked out again on each visit, so a translation that
 * ships later is picked up by the people who would have chosen it anyway.
 */
export function storeLocale(code: string): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code);
  } catch {
    // The choice just won't survive a reload.
  }
}

export function browserLocales(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages ?? [navigator.language];
}

/** A language's words. English and the test languages need no fetch. */
export async function loadMessages(code: string): Promise<Messages> {
  if (code === DEFAULT_LOCALE || isTestLocale(code)) return ENGLISH;
  const load = LOADERS[`./locales/${code}.json`];
  return load ? load() : ENGLISH;
}
