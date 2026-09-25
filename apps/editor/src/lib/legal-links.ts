import { env } from '@/lib/env';

/**
 * Where the legal pages are. They live on the web app, and the editor has no
 * footer of its own, so everything here that mentions them links out to these.
 *
 * Functions rather than constants: the URL is built against the environment,
 * which should not have to be valid just to import this.
 */
export function termsUrl(): string {
  return new URL('/terms', env.VITE_WEB_URL).toString();
}

export function privacyUrl(): string {
  return new URL('/privacy', env.VITE_WEB_URL).toString();
}

const VERSION_DATE = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * A terms version as a reader would say it. The version is the day the terms
 * were last updated, printed in UTC so it never slips a day for the reader's
 * zone.
 */
export function formatTermsVersion(version: string): string {
  return VERSION_DATE.format(new Date(version));
}
