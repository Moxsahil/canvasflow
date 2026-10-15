import type { NotificationSettings } from '@canvasflow/types';
import { env } from '@/lib/env';
import { t } from '../i18n';

/**
 * The account's email switches, from the API gateway at
 * `users/me/notifications`. Sends the board token and the session cookie, as
 * Account & Security does.
 */

function request(token: string | null, init: RequestInit = {}) {
  return fetch(`${env.VITE_API_URL}/users/me/notifications`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

/** The gateway's own sentence where it has one, and a plain one where it does not. */
async function failure(res: Response): Promise<Error> {
  if (res.status === 401) return new Error(t('library.sessionEnded'));
  if (res.status === 429) return new Error(t('errors.tooManyChanges'));
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return new Error(body?.message ?? t('errors.status', { status: res.status }));
}

/**
 * The last answer, kept for as long as the page is open, so Settings shows
 * the switches at once when it opens again and reads them afresh behind that.
 */
let lastKnown: NotificationSettings | null = null;
let inFlight: Promise<NotificationSettings> | null = null;

export function knownNotificationSettings(): NotificationSettings | null {
  return lastKnown;
}

/** Reads the switches, sharing a request already under way rather than starting a second. */
export function loadNotificationSettings(token: string | null): Promise<NotificationSettings> {
  if (inFlight) return inFlight;
  const read = request(token).then(async (res) => {
    if (!res.ok) throw await failure(res);
    const settings = ((await res.json()) as { data: NotificationSettings }).data;
    lastKnown = settings;
    return settings;
  });
  inFlight = read;
  const settle = () => {
    if (inFlight === read) inFlight = null;
  };
  read.then(settle, settle);
  return read;
}

/** Starts reading before the tab is chosen. Quiet on failure: the tab asks again. */
export function warmNotificationSettings(token: string | null): void {
  if (lastKnown || inFlight) return;
  loadNotificationSettings(token).catch(() => {});
}

/** Flip some switches, and take back all of them as they now stand. */
export async function saveNotificationSettings(
  token: string | null,
  changes: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const res = await request(token, { method: 'PATCH', body: JSON.stringify(changes) });
  if (!res.ok) throw await failure(res);
  const settings = ((await res.json()) as { data: NotificationSettings }).data;
  lastKnown = settings;
  return settings;
}
