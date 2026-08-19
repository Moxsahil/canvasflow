/** What the user picked. `system` follows the OS setting as it changes. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What the UI actually paints — `system` resolved against the OS. */
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'cf:theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export function darkThemeMediaQuery(): MediaQueryList | undefined {
  return window.matchMedia?.(DARK_QUERY);
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
    return 'system';
  }
}

export function storeTheme(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The choice just won't survive a reload.
  }
}
