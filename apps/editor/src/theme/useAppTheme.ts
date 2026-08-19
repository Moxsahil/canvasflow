import { useCallback, useEffect, useState } from 'react';
import {
  darkThemeMediaQuery,
  getSystemTheme,
  readStoredTheme,
  storeTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

interface AppTheme {
  /** The stored preference, including `system`. */
  theme: ThemePreference;
  /** The theme actually in effect, for `data-theme` on the editor root. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  /** Flips between light and dark, leaving `system` behind — Alt+Shift+D. */
  toggleTheme: () => void;
}

/**
 * preference is remembered, `system` tracks `prefers-color-scheme` live, and
 * the resolved theme drives a `data-theme` attribute the CSS keys off.
 *
 * The attribute is mirrored onto <html> as well, so the page behind the editor
 * (and native UI like scrollbars, via `color-scheme`) matches the app.
 */
export function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<ThemePreference>(readStoredTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Subscribed unconditionally rather than only while on `system`: the listener
  // is free, and it keeps `systemTheme` correct for the moment the user
  // switches back to `system`.
  useEffect(() => {
    const query = darkThemeMediaQuery();
    if (!query) return;
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    storeTheme(theme);
  }, [theme]);

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    return () => document.documentElement.removeAttribute('data-theme');
  }, [resolvedTheme]);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme]);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
