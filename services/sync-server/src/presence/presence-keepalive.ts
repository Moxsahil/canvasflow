import type { Hocuspocus } from '@hocuspocus/server';

/**
 * How often every open connection is asked to renew its presence.
 *
 * Under the fifteen seconds after which a record counts as getting old, so a
 * client that renews on this alone is never close to the thirty-second expiry.
 */
export const PRESENCE_RENEW_INTERVAL_MS = 10_000;

/** Sent to every connection; the editor answers by re-announcing itself. */
export interface PresenceRenewMessage {
  type: 'presence-renew';
}

/**
 * Keep everyone who is connected on everyone else's list.
 *
 * Presence rides on Yjs awareness, which expects each client to renew its
 * record every fifteen seconds on a timer, and drops any record not renewed in
 * thirty — here and in every peer. A board in a background tab cannot keep
 * that up: the browser slows its timers to once a minute after a few minutes
 * hidden, so the person dropped off other people's lists and reappeared every
 * minute, though they never left.
 *
 * A message from the server is not a timer, and arrives in a background tab as
 * promptly as in a visible one. Asking for the renewal from here ties being on
 * the list to having a connection open — someone leaves when their socket
 * closes, which removes their record at once — and the thirty-second expiry
 * is left for connections that died without saying so.
 *
 * Reaches the connections this process holds, which is all of them while the
 * service runs as a single machine.
 */
export function startPresenceKeepalive(server: Hocuspocus): () => void {
  const message = JSON.stringify({ type: 'presence-renew' } satisfies PresenceRenewMessage);

  const timer = setInterval(() => {
    for (const document of server.documents.values()) {
      for (const connection of document.getConnections()) {
        connection.sendStateless(message);
      }
    }
  }, PRESENCE_RENEW_INTERVAL_MS);

  // Never hold the process open for this.
  timer.unref();
  return () => clearInterval(timer);
}
