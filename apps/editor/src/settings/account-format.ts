import type { AccountSecurity, SignInProvider } from './account-security-api';

/**
 * The words the Account & Security pane shows, kept apart from the pane so
 * they can be read and tested without rendering anything.
 */

const PROVIDER_NAMES: Record<SignInProvider, string> = {
  google: 'Google',
  github: 'GitHub',
};

/**
 * Spelled out rather than taken from Intl: the short month names differ
 * between ICU versions ("Sep" in one, "Sept" in the next), so the same date
 * would read differently in different browsers.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['week', 7 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
];

/** "24 Sep 2026", in the viewer's own timezone. */
export function formatDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const elapsed = now - new Date(iso).getTime();
  if (elapsed < 60_000) return 'just now';
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return RELATIVE.format(-Math.floor(elapsed / size), unit);
  }
  return 'just now';
}

export function providerNames(providers: SignInProvider[]): string {
  return providers.map((p) => PROVIDER_NAMES[p]).join(' or ');
}

/** The Password row's line. */
export function passwordHint(security: AccountSecurity, now = Date.now()): string {
  if (!security.hasPassword) {
    const via = providerNames(security.providers);
    return via ? `Not set: you sign in with ${via}` : 'Not set';
  }
  if (security.passwordChangedAt) {
    return `Last changed ${formatRelative(security.passwordChangedAt, now)}`;
  }
  return `Unchanged since you signed up on ${formatDay(security.signedUpAt)}`;
}

/** The Connected accounts row's line: every way this account can sign in. */
export function signInMethodsHint(security: AccountSecurity): string {
  const methods = [
    ...(security.hasPassword ? ['Email and password'] : []),
    ...security.providers.map((p) => PROVIDER_NAMES[p]),
  ];
  return methods.length > 0 ? methods.join(' · ') : 'None';
}

/** The Active sessions row's line. */
export function sessionsHint(count: number): string {
  return `${count} ${count === 1 ? 'device' : 'devices'} signed in right now`;
}
