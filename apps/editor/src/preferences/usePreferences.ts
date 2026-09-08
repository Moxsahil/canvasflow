import { useCallback, useEffect, useState } from 'react';
import {
  readPreferences,
  storePreferences,
  type EditorPreferences,
  type PreferenceId,
} from './preferences';

export interface PreferencesState {
  values: EditorPreferences;
  set: (key: PreferenceId, value: boolean) => void;
}

/**
 * Holds what the preferences menu is showing.
 *
 * Only `showGrid` reaches the canvas so far — the rest are wired up as the
 * behaviour behind each one lands. It lives here rather than inside the menu
 * because the menu is a popup: state owned by it would reset every time it
 * closed, and boxes that forget whether they were ticked read as broken rather
 * than as unfinished.
 *
 * The whole set is stored, not just the one that does something, so a
 * preference gaining its behaviour later needs no migration of what people
 * have already ticked.
 */
export function usePreferences(): PreferencesState {
  const [values, setValues] = useState<EditorPreferences>(readPreferences);

  const set = useCallback((key: PreferenceId, value: boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  // Written from an effect rather than from `set`, so the updater stays free of
  // side effects — React runs it twice in development, and once more on every
  // retry it makes.
  useEffect(() => {
    storePreferences(values);
  }, [values]);

  return { values, set };
}
