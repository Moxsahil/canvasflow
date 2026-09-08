import { useCallback, useState } from 'react';
import { DEFAULT_PREFERENCES, type EditorPreferences, type PreferenceId } from './preferences';

export interface PreferencesState {
  values: EditorPreferences;
  set: (key: PreferenceId, value: boolean) => void;
}

/**
 * Holds what the preferences menu is showing.
 *
 * Nothing reads these yet — the menu is the whole feature for now, and each
 * preference is wired to the canvas as the behaviour behind it lands. It lives
 * here rather than inside the menu because the menu is a popup: state owned by
 * it would reset every time it closed, and boxes that forget whether they were
 * ticked read as broken rather than as unfinished.
 *
 * Nor does it persist. A preference that survives a reload but still changes
 * nothing is a promise the editor cannot keep; storage arrives with the first
 * switch that does something.
 */
export function usePreferences(): PreferencesState {
  const [values, setValues] = useState<EditorPreferences>(DEFAULT_PREFERENCES);

  const set = useCallback((key: PreferenceId, value: boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  return { values, set };
}
