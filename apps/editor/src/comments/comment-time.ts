const DIVISIONS = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
] as const;

/**
 * How long ago a comment was written, the short way: "now", "5m ago",
 * "yesterday", "3w ago".
 *
 * Anything under a minute is "now". Counted in seconds, the label would tick
 * over on every keystroke of a reply being typed under it.
 */
export function relativeTime(at: number, now = Date.now(), locale = 'en'): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' });
  let duration = (at - now) / 1000;
  if (Math.abs(duration) < 60) return format.format(0, 'second');

  for (const { amount, unit } of DIVISIONS) {
    if (Math.abs(duration) < amount) return format.format(Math.round(duration), unit);
    duration /= amount;
  }
  return '';
}

let fullFormat: Intl.DateTimeFormat | null = null;

/** The whole date and time, for a pointer resting on the short one. */
export function fullDateTime(at: number): string {
  fullFormat ??= new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short' });
  return fullFormat.format(new Date(at));
}
