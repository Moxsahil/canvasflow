import type { ShortcutCategory } from './shortcuts-registry';

/**
 * A heading costs roughly this many rows of height, counting the space above
 * the group it opens. Only the ratio to a row matters — it is what keeps a
 * column of many short groups from being called shorter than it looks.
 */
const HEADING_ROWS = 1.5;

function heightOf(category: ShortcutCategory): number {
  return category.entries.length + HEADING_ROWS;
}

/**
 * Deals the categories into columns of about equal height.
 *
 * Reading order is preserved — each column takes the next run of categories,
 * so the list still runs top to bottom, then left to right. A category starts
 * a new column when carrying it would leave the current one further from its
 * share of the total than stopping short does, which is what stops one long
 * group from setting the height of the whole dialog.
 */
export function balanceColumns(
  categories: ShortcutCategory[],
  columnCount: number,
): ShortcutCategory[][] {
  const columns: ShortcutCategory[][] = Array.from({ length: columnCount }, () => []);
  if (columnCount < 1) return columns;

  const total = categories.reduce((sum, category) => sum + heightOf(category), 0);
  const share = total / columnCount;

  let index = 0;
  let filled = 0;

  for (const category of categories) {
    const height = heightOf(category);
    const overshoot = Math.abs(filled + height - share);
    const shortfall = Math.abs(filled - share);

    // Never leaves a column empty, and never spills past the last one.
    if (filled > 0 && overshoot > shortfall && index < columnCount - 1) {
      index += 1;
      filled = 0;
    }

    columns[index]?.push(category);
    filled += height;
  }

  return columns;
}
