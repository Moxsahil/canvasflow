import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatShortcut } from '../help/platform';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  PREFERENCE_GROUPS,
  readPreferences,
  storePreferences,
  type PreferenceId,
} from './preferences';

const items = PREFERENCE_GROUPS.flatMap((group) => group.items);

/**
 * Preferences the menu deliberately does not offer yet.
 *
 * Named here rather than simply tolerated, so the check below still catches a
 * preference that fell out of the menu by accident. A preference on this list
 * is one whose value the editor reads and whose row is still to be settled;
 * emptying the list is what finishing that work looks like.
 */
const HELD_BACK: readonly PreferenceId[] = ['snapToMidpoints'];

/**
 * The menu itself is a popup, and this suite runs without a DOM, so what is
 * pinned here is the table it renders from: every preference reaches the menu,
 * once, saying something.
 */
describe('preference groups', () => {
  it('puts every preference in the menu, so none is declared and then unreachable', () => {
    const listed = items.map((item) => item.id).sort();
    const declared = (Object.keys(DEFAULT_PREFERENCES) as PreferenceId[])
      .filter((id) => !HELD_BACK.includes(id))
      .sort();
    expect(listed).toEqual(declared);
  });

  it('holds back only preferences that still exist', () => {
    // Otherwise a preference deleted outright would leave its name here and
    // quietly excuse a future one that happened to be given the same name.
    for (const id of HELD_BACK) {
      expect(DEFAULT_PREFERENCES, id).toHaveProperty(id);
      expect(
        items.map((item) => item.id),
        id,
      ).not.toContain(id);
    }
  });

  it('lists each preference once, so no two rows fight over the same value', () => {
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('gives every preference a label and a tooltip that is not just the label again', () => {
    for (const item of items) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.hint.length).toBeGreaterThan(item.label.length);
    }
  });

  it('writes shortcuts in a notation the formatter understands', () => {
    // A combo it cannot read comes back as the raw text, which would print
    // "MOD+'" into the menu rather than a key.
    for (const item of items.filter((entry) => entry.shortcut)) {
      expect(formatShortcut(item.shortcut!)).not.toContain('MOD');
    }
  });

  it('starts the four that read as broken when off, on', () => {
    const on = (Object.keys(DEFAULT_PREFERENCES) as PreferenceId[]).filter(
      (key) => DEFAULT_PREFERENCES[key],
    );
    expect(on.sort()).toEqual(['arrowBinding', 'edgeScrolling', 'selectOnWrap', 'snapToMidpoints']);
  });
});

describe('stored preferences', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });
  });

  it('reads back what it wrote', () => {
    const values = { ...DEFAULT_PREFERENCES, showGrid: true, toolLock: true };
    storePreferences(values);
    expect(readPreferences()).toEqual(values);
  });

  it('starts from the defaults when nothing has been stored', () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('fills in a preference that was added after the values were stored', () => {
    store[PREFERENCES_STORAGE_KEY] = JSON.stringify({ showGrid: true });

    expect(readPreferences()).toEqual({ ...DEFAULT_PREFERENCES, showGrid: true });
  });

  it('drops keys and values it does not recognise', () => {
    // A checkbox handed a non-boolean goes uncontrolled, and a preference
    // removed in a later version would sit in storage forever.
    store[PREFERENCES_STORAGE_KEY] = JSON.stringify({
      showGrid: 'yes',
      wasRemovedInVersion2: true,
    });

    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('falls back to the defaults rather than throwing on unreadable storage', () => {
    store[PREFERENCES_STORAGE_KEY] = 'not json';
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);

    store[PREFERENCES_STORAGE_KEY] = 'null';
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });
});
