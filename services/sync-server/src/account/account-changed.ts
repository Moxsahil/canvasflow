import type { Hocuspocus } from '@hocuspocus/server';

/**
 * The parts of an account another of its tabs may be showing, which can
 * change from somewhere else: today, its email switches.
 */
export const ACCOUNT_PARTS = ['notifications'] as const;

export type AccountPart = (typeof ACCOUNT_PARTS)[number];

export function isAccountPart(value: unknown): value is AccountPart {
  return typeof value === 'string' && (ACCOUNT_PARTS as readonly string[]).includes(value);
}

/**
 * Sent to every open board of one person when part of their account changed
 * in another tab or on another device, so whichever of them shows it re-reads.
 *
 * Says which part and nothing else. The editor fetches the new state through
 * the route that checks who is asking, as it does for a workspace change.
 */
export interface AccountChangedMessage {
  type: 'account-changed';
  part: AccountPart;
}

/**
 * Tell every open connection belonging to this person, on whatever board it
 * is, that part of their account changed. Returns how many were told.
 *
 * Reaches the connections this process holds, which is all of them while the
 * service runs as a single machine.
 */
export function announceAccountChanged(
  server: Hocuspocus,
  userId: string,
  part: AccountPart,
): number {
  const message = JSON.stringify({ type: 'account-changed', part } satisfies AccountChangedMessage);

  let told = 0;
  for (const document of server.documents.values()) {
    for (const connection of document.getConnections()) {
      if ((connection.context as { userId?: string }).userId !== userId) continue;
      connection.sendStateless(message);
      told += 1;
    }
  }
  return told;
}
