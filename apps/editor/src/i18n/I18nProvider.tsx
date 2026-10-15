import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_LOCALE, isTestLocale } from './languages';
import {
  availableLocales,
  browserLocales,
  ENGLISH,
  findLanguage,
  initialLocale,
  loadMessages,
  readStoredLocale,
  setCurrentLanguage,
  storeLocale,
  translate,
  type Messages,
  type WordKey,
  type TranslationValues,
} from './i18n';

export interface I18n {
  /** The language on screen now — the one being fetched takes over only once it has arrived. */
  locale: string;
  dir: 'ltr' | 'rtl';
  t: (key: WordKey, values?: TranslationValues) => string;
  /** Codes that can be switched to; anything else in the menu reads "Soon". */
  available: readonly string[];
  setLocale: (code: string) => void;
}

const englishT = (key: WordKey, values?: TranslationValues) =>
  translate(ENGLISH, DEFAULT_LOCALE, key, values);

/**
 * English, for anything rendered outside the provider — a test rendering one
 * component on its own, say — so a missing provider shows the app as it was
 * written rather than failing.
 */
const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  dir: 'ltr',
  t: englishT,
  available: [DEFAULT_LOCALE],
  setLocale: () => {},
});

interface Active {
  locale: string;
  messages: Messages;
}

/** Holds the editor's language, above the router so every board shares it. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const available = useMemo(() => availableLocales(), []);
  const [requested, setRequested] = useState(() =>
    initialLocale(readStoredLocale(), browserLocales(), available),
  );
  // English until the requested language's file is in: words in two
  // languages at once would be worse than a moment more of the old one.
  const [active, setActive] = useState<Active>(() => {
    const locale = isTestLocale(requested) ? requested : DEFAULT_LOCALE;
    setCurrentLanguage(locale, ENGLISH);
    return { locale, messages: ENGLISH };
  });

  useEffect(() => {
    let cancelled = false;
    void loadMessages(requested).then(
      (messages) => {
        if (cancelled) return;
        setCurrentLanguage(requested, messages);
        setActive({ locale: requested, messages });
      },
      () => {
        // A file that won't load leaves the language as it was.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [requested]);

  const dir = findLanguage(active.locale)?.rtl ? 'rtl' : 'ltr';

  useEffect(() => {
    const root = document.documentElement;
    // The test languages are English underneath, and not real language tags.
    root.lang = isTestLocale(active.locale) ? DEFAULT_LOCALE : active.locale;
    root.dir = dir;
  }, [active.locale, dir]);

  const setLocale = useCallback(
    (code: string) => {
      if (!available.includes(code)) return;
      storeLocale(code);
      setRequested(code);
    },
    [available],
  );

  const t = useCallback(
    (key: WordKey, values?: TranslationValues) =>
      translate(active.messages, active.locale, key, values),
    [active],
  );

  const value = useMemo<I18n>(
    () => ({ locale: active.locale, dir, t, available, setLocale }),
    [active.locale, dir, t, available, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** Just the lookup, for components that only show words. */
export function useT(): I18n['t'] {
  return useContext(I18nContext).t;
}
