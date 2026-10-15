export interface Language {
  /** BCP 47, as `<html lang>` would take it, and the name of its file in locales/. */
  readonly code: string;
  /**
   * In its own language: a language menu is read by someone who may not read
   * the one the app is in right now.
   */
  readonly label: string;
  /** Written right to left, so the whole page turns round with it. */
  readonly rtl?: boolean;
}

/** The language every word is first written in, and the one any missing word falls back to. */
export const DEFAULT_LOCALE = 'en';

/**
 * The account menu's Language list. A language here without a file in
 * locales/ is listed but can't be chosen yet — it reads "Soon".
 */
export const LANGUAGES: readonly Language[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh-CN', label: '中文' },
];

export const TEST_LOCALE = 'test';
export const TEST_RTL_LOCALE = 'test-rtl';

/**
 * Two made-up languages for development only. Every word in them shows as its
 * own key in brackets, so a word still written straight into a component —
 * one nobody has moved into en.json yet — is the only plain English left on
 * screen. The right-to-left one shows what the layout does turned round.
 */
export const TEST_LANGUAGES: readonly Language[] = [
  { code: TEST_LOCALE, label: 'Test language' },
  { code: TEST_RTL_LOCALE, label: 'Test language (RTL)', rtl: true },
];

export function isTestLocale(code: string): boolean {
  return code === TEST_LOCALE || code === TEST_RTL_LOCALE;
}
