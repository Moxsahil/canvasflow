import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NotificationKind } from '@canvasflow/types';

/**
 * The credential in an email's unsubscribe link: proof that this link was
 * mailed to this account about this switch, and good for turning that one
 * switch off and nothing else.
 *
 * Derived from AUTH_SECRET, like the internal-route credentials, with a
 * purpose of its own so the value is useless anywhere else. It never expires:
 * an unsubscribe link has to work from an email however old, and the most it
 * can do is turn off an email its holder was being sent.
 */
const PURPOSE = 'canvasflow:unsubscribe:v1';

export function unsubscribeToken(secret: string, userId: string, kind: NotificationKind): string {
  return createHmac('sha256', secret).update(`${PURPOSE}:${userId}:${kind}`).digest('base64url');
}

/** Constant-time, because the route that asks is open to anyone. */
export function isUnsubscribeToken(
  secret: string,
  userId: string,
  kind: NotificationKind,
  presented: unknown,
): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const expected = Buffer.from(unsubscribeToken(secret, userId, kind));
  const given = Buffer.from(presented);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Where an email's unsubscribe links go: a page on the web app for the person
 * reading it, which asks before it does anything, and this service's route for
 * the mail client's own one-click button (RFC 8058), which posts to it.
 */
export function unsubscribeLinks(
  urls: { webUrl: string; apiUrl: string },
  secret: string,
  userId: string,
  kind: NotificationKind,
): { pageUrl: string; oneClickUrl: string } {
  const query = new URLSearchParams({
    u: userId,
    k: kind,
    t: unsubscribeToken(secret, userId, kind),
  });
  return {
    pageUrl: `${new URL('/unsubscribe', urls.webUrl).toString()}?${query.toString()}`,
    oneClickUrl: `${new URL('/notifications/unsubscribe', urls.apiUrl).toString()}?${query.toString()}`,
  };
}
