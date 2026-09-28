import { ACCOUNT_DELETION_GRACE_DAYS } from '@canvasflow/types';

/** The same wording the confirmation email uses, so the two never disagree. */
const WHEN = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'UTC',
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How far from now a date in the link may be and still be shown. The erasure
 * runs within days, so anything further out is a link somebody edited; it
 * gets the plain promise instead of their date on our page.
 */
const PLAUSIBLE_MS = 31 * DAY_MS;

/**
 * When the erasure runs, as the rest of a sentence: "after 5 October 2026 at
 * 14:05 UTC", from the date the editor puts in the link, or "in 7 days" when
 * there is no date that can be believed.
 */
export function erasureTime(until: unknown, now: number = Date.now()): string {
  const at = typeof until === 'string' ? Date.parse(until) : Number.NaN;
  if (Number.isFinite(at) && Math.abs(at - now) <= PLAUSIBLE_MS) {
    return `after ${WHEN.format(at)} UTC`;
  }
  return `in ${ACCOUNT_DELETION_GRACE_DAYS} days`;
}
