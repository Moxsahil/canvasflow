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

export function translate(
  messages: Messages,
  locale: string,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  if (isTestLocale(locale)) {
    const slots = values ? `(${Object.keys(values).join(', ')})` : '';
    // Isolated, so a bracketed key keeps its own direction inside the
    // right-to-left test language instead of having its brackets flipped.
    return `⁨[[${key}${slots}]]⁩`;
  }

  let text = messages[key] ?? ENGLISH[key] ?? key;
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{{${name}}}`, String(value));
    }
  }
  return text;
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
