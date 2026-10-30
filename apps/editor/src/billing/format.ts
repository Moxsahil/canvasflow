/*
 * Money, dates and addresses for the billing screens. Kept apart from the
 * upgrade pages so Settings can use them without loading those pages.
 */

/** Where the back link goes: the board the page was opened from, if it named one. */
export function boardAddress(from: string | null): string {
  return from && /^[0-9a-f-]{36}$/i.test(from) ? `/boards/${from}` : '/';
}

/** Dollars with cents, as a receipt reads. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
