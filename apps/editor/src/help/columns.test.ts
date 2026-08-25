import { describe, expect, it } from 'vitest';
import { balanceColumns } from './columns';
import { SHORTCUTS, type ShortcutCategory } from './shortcuts-registry';

function category(title: string, entries: number): ShortcutCategory {
  return {
    title,
    entries: Array.from({ length: entries }, (_, index) => ({
      keys: `${title}-${index}`,
      description: `${title} ${index}`,
    })),
  };
}

/** What the dialog is as tall as: rows, plus a heading's worth per group. */
function height(column: ShortcutCategory[]): number {
  return column.reduce((sum, group) => sum + group.entries.length + 1.5, 0);
}

describe('balanceColumns', () => {
  it('keeps the categories in order, left to right', () => {
    const columns = balanceColumns(SHORTCUTS, 3);
    expect(columns.flat().map((group) => group.title)).toEqual(
      SHORTCUTS.map((group) => group.title),
    );
  });

  it('leaves no column empty and loses nothing', () => {
    const columns = balanceColumns(SHORTCUTS, 3);
    expect(columns).toHaveLength(3);
    expect(columns.every((column) => column.length > 0)).toBe(true);
    expect(columns.flat()).toHaveLength(SHORTCUTS.length);
  });

  it('is no taller than a third of the total, plus one group', () => {
    const columns = balanceColumns(SHORTCUTS, 3);
    const total = height(SHORTCUTS);
    const tallestGroup = Math.max(...SHORTCUTS.map((group) => height([group])));

    expect(Math.max(...columns.map(height))).toBeLessThanOrEqual(total / 3 + tallestGroup);
  });

  it('does not let one long group set the height on its own', () => {
    // The shape this replaced: one category holding half of everything.
    const columns = balanceColumns([category('Tools', 10), category('Editor', 20)], 3);
    expect(columns.map((column) => column.map((group) => group.title))).toEqual([
      ['Tools'],
      ['Editor'],
      [],
    ]);
  });

  it('fills fewer columns than asked rather than splitting a group', () => {
    const columns = balanceColumns([category('Only', 4)], 3);
    expect(columns[0]).toHaveLength(1);
    expect(columns.flat()).toHaveLength(1);
  });
});
