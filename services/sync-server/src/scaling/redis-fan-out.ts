import { Redis } from '@hocuspocus/extension-redis';

/**
 * Cross-instance fan-out for rooms.
 *
 * A room lives in one process's memory. Two clients served by the same
 * process share that `Y.Doc` object and see each other; two clients served by
 * different processes hold separate copies of the same board and see nothing
 * of each other's work. Presence rides the same broker, so cursors and the
 * peer list vanish across the boundary too.
 *
 * That is not only a scaling concern. A rolling deploy is, by definition, a
 * window in which two instances are live at once — so without this the first
 * zero-downtime deploy silently splits every open board in half.
 *
 * This extension carries updates and awareness between instances over Redis
 * pub/sub. Note what it is *not* doing: conflict resolution belongs to Yjs,
 * whose updates are idempotent and commutative, so the transport needs no
 * ordering or exactly-once guarantee. Redis being briefly unavailable
 * degrades to the split above and then reconverges — it does not corrupt a
 * document.
 */

/**
 * Redis reached over one URL, the way DATABASE_URL already works here.
 *
 * The extension's own configuration takes host and port as separate fields,
 * so the URL is split apart here rather than making deployment carry four
 * variables that every managed provider hands out as one string.
 */
function parseRedisUrl(redisUrl: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
} {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    // ioredis treats the presence of `tls` as the switch, not its contents.
    // An empty object is how you say "TLS with the defaults".
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

/**
 * Build the fan-out extension, or nothing when no Redis is configured.
 *
 * Returning an empty list rather than throwing is deliberate: a single
 * instance is a legitimate way to run this service, and requiring a Redis to
 * develop against would be a tax paid every day to prevent a problem that
 * only exists with a second replica.
 */
export function createFanOutExtensions(redisUrl: string | undefined): Redis[] {
  if (!redisUrl) return [];

  const { host, port, username, password, tls } = parseRedisUrl(redisUrl);

  return [
    new Redis({
      host,
      port,
      options: { username, password, tls },

      /**
       * Namespaced so a Redis shared with anything else — a cache, a queue —
       * cannot collide with room traffic.
       */
      prefix: 'canvasflow:sync',
    }),
  ];
}
