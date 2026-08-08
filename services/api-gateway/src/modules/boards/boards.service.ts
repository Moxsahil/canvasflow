import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infra/database/database.service.js';
import { boards, memberships, workspaces, type BoardRow } from '@canvasflow/db';
import { eq, isNull, and, inArray, asc, getTableColumns } from 'drizzle-orm';

export interface CreateBoardInput {
  userId: string;
  userName?: string;
  title: string;
}

@Injectable()
export class BoardsService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * List boards in workspaces the user belongs to.
   * Soft-deleted boards are excluded.
   */
  async findAllForUser(userId: string): Promise<BoardRow[]> {
    const workspaceIds = await this.getUserWorkspaceIds(userId);
    if (workspaceIds.length === 0) return [];

    return this.database.db
      .select()
      .from(boards)
      .where(and(inArray(boards.workspaceId, workspaceIds), isNull(boards.deletedAt)));
  }

  /**
   * Fetch a single board ONLY if the user is a member of its workspace.
   * Returns null if the board doesn't exist, is soft-deleted, OR the
   * user lacks access. Callers should treat null as 404 — never leak
   * "exists but forbidden" because that's its own info disclosure.
   *
   * Uses a single JOIN query rather than two sequential round trips.
   * Matches the same optimization in
   * services/sync-server/src/auth/check-board-access.ts and
   * apps/web/src/lib/boards/access.ts.
   *
   * getTableColumns(boards) keeps the result flat as BoardRow — a bare
   * .select() alongside a join would nest it as { boards, memberships }.
   *
   * MIRRORS: sync-server + web app helpers.
   * ANY CHANGE HERE MUST BE MIRRORED TO BOTH.
   */
  async findByIdForUser(id: string, userId: string): Promise<BoardRow | null> {
    const rows = await this.database.db
      .select(getTableColumns(boards))
      .from(boards)
      .innerJoin(memberships, eq(memberships.workspaceId, boards.workspaceId))
      .where(and(eq(boards.id, id), eq(memberships.userId, userId), isNull(boards.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * Create an empty board in the user's default workspace.
   *
   * "Default" is the workspace they joined first, which keeps repeated
   * creations landing in the same place. Signup doesn't provision a
   * workspace, so a user can legitimately have none — in that case we
   * create a personal one for them rather than failing the request.
   *
   * The board carries no shapes: the Yjs document is created lazily by the
   * editor on first open, so an empty update log *is* a blank board.
   */
  async createForUser(input: CreateBoardInput): Promise<BoardRow> {
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ workspaceId: memberships.workspaceId })
        .from(memberships)
        .where(eq(memberships.userId, input.userId))
        .orderBy(asc(memberships.joinedAt))
        .limit(1);

      let workspaceId = existing?.workspaceId;

      if (!workspaceId) {
        const [workspace] = await tx
          .insert(workspaces)
          .values({
            name: input.userName ? `${input.userName}'s workspace` : 'My workspace',
            // The user id guarantees uniqueness on the slug column without
            // needing a collision-retry loop.
            slug: `personal-${input.userId}`,
          })
          .returning();
        if (!workspace) throw new Error('Failed to create personal workspace');

        await tx.insert(memberships).values({
          workspaceId: workspace.id,
          userId: input.userId,
          role: 'owner',
        });

        workspaceId = workspace.id;
      }

      const [board] = await tx
        .insert(boards)
        .values({
          workspaceId,
          ownerId: input.userId,
          title: input.title,
          visibility: 'workspace',
        })
        .returning();
      if (!board) throw new Error('Failed to create board');

      return board;
    });
  }

  private async getUserWorkspaceIds(userId: string): Promise<string[]> {
    const rows = await this.database.db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    return rows.map((r) => r.workspaceId);
  }
}
