import { formatLocale, formatShortDate, t } from '../i18n';
import type { AccountSecurity, SignInProvider } from './account-security-api';

/**
 * The words the Account & Security pane shows, kept apart from the pane so
 * they can be read and tested without rendering anything.
 */

const PROVIDER_NAMES: Record<SignInProvider, string> = {
  google: 'Google',
  github: 'GitHub',
};

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
  return formatShortDate(new Date(iso));
}

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const elapsed = now - new Date(iso).getTime();
  if (elapsed < 60_000) return t('time.justNow');
  const relative = new Intl.RelativeTimeFormat(formatLocale(), { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (elapsed >= size) return relative.format(-Math.floor(elapsed / size), unit);
  }
  return t('time.justNow');
}

export function providerNames(providers: SignInProvider[]): string {
  return providers.map((p) => PROVIDER_NAMES[p]).join(` ${t('common.or')} `);
}

/** The Password row's line. */
export function passwordHint(security: AccountSecurity, now = Date.now()): string {
  if (!security.hasPassword) {
    const via = providerNames(security.providers);
    return via ? t('account.passwordNotSetVia', { via }) : t('account.notSet');
  }
  if (security.passwordChangedAt) {
    return t('account.passwordChanged', { when: formatRelative(security.passwordChangedAt, now) });
  }
  return t('account.passwordUnchanged', { date: formatDay(security.signedUpAt) });
}

/** The Connected accounts row's line: every way this account can sign in. */
export function signInMethodsHint(security: AccountSecurity): string {
  const methods = [
    ...(security.hasPassword ? [t('account.emailAndPassword')] : []),
    ...security.providers.map((p) => PROVIDER_NAMES[p]),
  ];
  return methods.length > 0 ? methods.join(' · ') : t('account.none');
}

/** The Active sessions row's line. */
export function sessionsHint(count: number): string {
  return t('account.devicesSignedIn', { count });
}

/**
 * "740 KB", "3.2 MB", "48 MB", "1.4 GB". Binary units, as the image size limit
 * reads them. Anything stored reads as at least 1 KB, so a board with a few
 * shapes on it never shows as nothing.
 */
export function formatStorageSize(bytes: number): string {
  const kb = bytes / 1024;
  const number = (value: number, digits: number) =>
    value.toLocaleString(formatLocale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  if (kb < 1024)
    return t('units.kb', { size: number(bytes > 0 ? Math.max(1, Math.round(kb)) : 0, 0) });
  const mb = kb / 1024;
  if (mb < 1024)
    return t('units.mb', { size: mb < 10 ? number(mb, 1) : number(Math.round(mb), 0) });
  return t('units.gb', { size: number(mb / 1024, 1) });
}

/** The Storage used row's line: what the number is made of. */
export function storageHint(usage: { boards: number; images: number }): string {
  if (usage.boards === 0) return t('storage.noBoards');
  const boards = t('storage.acrossBoards', { count: usage.boards });
  if (usage.images === 0) return boards;
  return `${boards} · ${t('storage.images', { count: usage.images })}`;
}
