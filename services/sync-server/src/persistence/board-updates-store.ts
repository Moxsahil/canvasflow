import { boardUpdates, type Database } from '@canvasflow/db';
import { asc, eq } from 'drizzle-orm';

/**
 * Sync-server's persistence layer for Yjs board updates.
 *
 * Schema-compatible with services/api-gateway/src/modules/board-updates/
 * board-updates.service.ts so HTTP and WebSocket writes coexist in the
 * same table. Reads and writes here MUST match the api-gateway's
 * conventions — that service is the source of truth for the schema
 * contract.
 *
 * Notably, we do NOT re-verify workspace membership on each read/write:
 * - Connection was authorized in onAuthenticate (see src/index.ts)
 * - Periodic reauth (PR #29) closes the revocation window
 *
 * The api-gateway does verify per-call because HTTP requests have no
 * persistent connection context; sync-server does not, because it does.
 */

/** Reject empty updates and grossly oversized ones — same policy as api-gateway. */
const MAX_UPDATE_BYTES = 1_000_000;

export class UpdateTooLargeError extends Error {
  constructor(size: number) {
    super(`Update too large (${size} bytes, max ${MAX_UPDATE_BYTES})`);
    this.name = 'UpdateTooLargeError';
  }
}

export class EmptyUpdateError extends Error {
  constructor() {
    super('Empty update rejected');
    this.name = 'EmptyUpdateError';
  }
}

/**
 * Load all Yjs updates for a board in chronological order.
 * Returned as raw bytes; caller applies each via Y.applyUpdate().
 *
 * Empty array = new board with no history yet. Not an error.
 */
export async function loadUpdates(db: Database, boardId: string): Promise<Uint8Array[]> {
  const rows = await db
    .select({ update: boardUpdates.update })
    .from(boardUpdates)
    .where(eq(boardUpdates.boardId, boardId))
    .orderBy(asc(boardUpdates.createdAt));

  return rows.map((r) => r.update);
}

/**
 * Append a Yjs update to a board's log.
 * Author is the authenticated user driving this connection.
 */
export async function appendUpdate(
  db: Database,
  boardId: string,
  authorId: string,
  update: Uint8Array,
): Promise<void> {
  if (update.length === 0) {
    throw new EmptyUpdateError();
  }
  if (update.length > MAX_UPDATE_BYTES) {
    throw new UpdateTooLargeError(update.length);
  }

  await db.insert(boardUpdates).values({
    boardId,
    authorId,
    update,
    sizeBytes: update.length,
  });
}
