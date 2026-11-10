import { Redis } from '@hocuspocus/extension-redis';
import type {
  Document,
  afterUnloadDocumentPayload,
  onStoreDocumentPayload,
} from '@hocuspocus/server';

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

const PREFIX = 'canvasflow:sync';

/** How long to wait before looking again at a room whose save this instance lost. */
const IDLE_RECHECK_MS = 1_000;

/**
 * The stock extension, with room unloading left to the server.
 *
 * The stock extension unloads a room itself one second after its last
 * connection closes. That ignores `unloadImmediately: false` and, worse, runs
 * while the server's debounced save of the last edit is still pending. When
 * the board is reopened inside that window (a page reload is enough), a new
 * document is loaded under the same name; the old pending save then finishes,
 * sees no connections on the old object, and calls unloadDocument on it. The
 * server looks rooms up by name, so that removes the new document from its
 * map. Everyone who just joined is left on a document the server no longer
 * lists: Redis messages for the board never reach them and their edits never
 * leave the instance. Reproduced in scripts/metrics/scaling/redis-unload-race.mjs.
 *
 * So this subclass never unloads on disconnect. The server already unloads a
 * room on its own schedule — at once when nothing is waiting to be saved,
 * otherwise right after the save — and the channel is left when that happens.
 *
 * One path needs help: an instance that loses the save lock to another
 * instance has its save skipped, and the server only unloads after a save
 * that succeeds. Such a room is unloaded here once it is idle, by object
 * identity, so a newer room of the same name is never touched.
 */
export class RoomSafeRedis extends Redis {
  constructor(configuration: ConstructorParameters<typeof Redis>[0]) {
    super(configuration);
    // Replaces the stock onDisconnect, which unloads the room. See above.
    this.onDisconnect = async () => {};
  }

  override async onStoreDocument(payload: onStoreDocumentPayload): Promise<void> {
    try {
      await super.onStoreDocument(payload);
    } catch (error) {
      // Lost the lock: another instance saves this round, and the server will
      // not unload this copy after a skipped save.
      this.unloadWhenIdle(payload.documentName, payload.document);
      throw error;
    }
  }

  async afterUnloadDocument({ documentName }: afterUnloadDocumentPayload): Promise<void> {
    // A room of the same name may already be loading again; it needs the channel.
    if (this.instance.documents.has(documentName)) return;
    await new Promise<void>((resolve) => {
      this.sub.unsubscribe(`${PREFIX}:${documentName}`, () => resolve());
    });
  }

  private unloadWhenIdle(documentName: string, document: Document): void {
    setTimeout(() => {
      // Gone already, or replaced by a newer room of the same name.
      if (this.instance.documents.get(documentName) !== document) return;
      // In use again: the server unloads it the usual way when they leave.
      if (document.getConnectionsCount() > 0) return;
      if (
        document.isLoading ||
        this.instance.debouncer.isDebounced(`onStoreDocument-${documentName}`)
      ) {
        this.unloadWhenIdle(documentName, document);
        return;
      }
      void this.instance.unloadDocument(document);
    }, IDLE_RECHECK_MS).unref();
  }
}

/**
 * Build the fan-out extension, or nothing when no Redis is configured.
 *
 * Returning an empty list rather than throwing is deliberate: a single
 * instance is a legitimate way to run this service, and requiring a Redis to
 * develop against would be a tax paid every day to prevent a problem that
 * only exists with a second replica.
 */
export function createFanOutExtensions(redisUrl: string | undefined): RoomSafeRedis[] {
  if (!redisUrl) return [];

  const { host, port, username, password, tls } = parseRedisUrl(redisUrl);

  return [
    new RoomSafeRedis({
      host,
      port,
      options: { username, password, tls },

      /**
       * Namespaced so a Redis shared with anything else — a cache, a queue —
       * cannot collide with room traffic.
       */
      prefix: PREFIX,
    }),
  ];
}
