import { DatabaseService } from '../../infra/database/database.service.js';
import { boardUpdates, boards, memberships } from '@canvasflow/db';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, and, inArray, isNull, asc } from 'drizzle-orm';

// interface UpdateRecord {
//   update: Uint8Array;
//   createdAt: Date;
//   authorId: string;
//   sizeBytes: number;
// }

interface LoadResult {
  updates: Uint8Array[];
  totalUpdates: number;
  totalBytes: number;
}

@Injectable()
export class BoardUpdatesService {
  constructor(private readonly database: DatabaseService) {}
  /**
   * Verify the user has access to this board via workspace membership.
   * Throws NotFoundException if the board doesn't exist OR user can't see it —
   * intentionally 404, not 403, to avoid leaking board existence.
   */

  private async verifyAccess(boardId: string, userId: string): Promise<void> {
    const userWorkspaces = await this.database.db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    const workspaceIds = userWorkspaces.map((w) => w.workspaceId);
    if (workspaceIds.length === 0) {
      throw new NotFoundException(`Board ${boardId} not found`);
    }

    const board = await this.database.db
      .select()
      .from(boards)
      .where(
        and(
          eq(boards.id, boardId),
          inArray(boards.workspaceId, workspaceIds),
          isNull(boards.deletedAt),
        ),
      )
      .limit(1);
    if (board.length === 0) {
      throw new NotFoundException(`Board ${boardId} not found`);
    }
  }
  /**
   * Load all Yjs updates for a board in chronological order.
   * Client applies them in order to reconstruct the document.
   */
  async loadUpdates(boardId: string, userId: string): Promise<LoadResult> {
    await this.verifyAccess(boardId, userId);

    const rows = await this.database.db
      .select({
        update: boardUpdates.update,
        createdAt: boardUpdates.createdAt,
        authorId: boardUpdates.authorId,
        sizeBytes: boardUpdates.sizeBytes,
      })
      .from(boardUpdates)
      .where(eq(boardUpdates.boardId, boardId))
      .orderBy(asc(boardUpdates.createdAt));

    const totalBytes = rows.reduce((acc, r) => acc + r.sizeBytes, 0);

    return {
      updates: rows.map((r) => r.update),
      totalUpdates: rows.length,
      totalBytes,
    };
  }
  /**
   * Append a Yjs update to the log for this board.
   */

  async appendUpdates(
    boardId: string,
    userId: string,
    update: Uint8Array,
  ): Promise<{ id: string; createdAt: Date }> {
    await this.verifyAccess(boardId, userId);

    if (update.length === 0) {
      throw new ForbiddenException('Empty update rejected');
    }

    // Reasonable per-update size cap.Individual Yjs updates are tiny
    // huge updates suggest a bug or abuse.

    const MAX_UPDATES_BYTES = 1_000_000;
    if (update.length > MAX_UPDATES_BYTES) {
      throw new ForbiddenException(
        `Update too large (${update.length} bytes, max ${MAX_UPDATES_BYTES})`,
      );
    }

    const [inserted] = await this.database.db
      .insert(boardUpdates)
      .values({
        boardId,
        authorId: userId,
        update,
        sizeBytes: update.length,
      })
      .returning({
        id: boardUpdates.id,
        createdAt: boardUpdates.createdAt,
      });

    if (!inserted) {
      throw new Error('Failed to insert board update');
    }
    return inserted;
  }
}
