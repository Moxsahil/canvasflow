import { describe, expect, it } from 'vitest';
import { formatShortcut } from '../help/platform';
import { DEFAULT_PREFERENCES, PREFERENCE_GROUPS, type PreferenceId } from './preferences';

const items = PREFERENCE_GROUPS.flatMap((group) => group.items);

/**
 * The menu itself is a popup, and this suite runs without a DOM, so what is
 * pinned here is the table it renders from: every preference reaches the menu,
 * once, saying something.
 */
describe('preference groups', () => {
  it('puts every preference in the menu, so none is declared and then unreachable', () => {
    const listed = items.map((item) => item.id).sort();
    const declared = Object.keys(DEFAULT_PREFERENCES).sort();
    expect(listed).toEqual(declared);
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
