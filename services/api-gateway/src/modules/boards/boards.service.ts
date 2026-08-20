import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infra/database/database.service.js';
import { boards, memberships, workspaces, resolveBoardAccess, type BoardRow } from '@canvasflow/db';
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
   * Fetch a single board ONLY if the user may access it.
   *
   * Authorization is delegated to `resolveBoardAccess` in @canvasflow/db, the
   * one place that knows the rule — owner, then explicit board membership,
   * then workspace fallback, with a revocation beating the fallback. This
   * service, sync-server and the web app each used to carry their own copy of
   * the workspace join, which could only ever see workspace members and so
   * would not honour a board shared with an outsider.
   *
   * Returns null if the board doesn't exist, is soft-deleted, OR the user
   * lacks access. Callers must treat null as 404 — never leak "exists but
   * forbidden", which is its own information disclosure.
   */
  async findByIdForUser(id: string, userId: string): Promise<BoardRow | null> {
    const access = await resolveBoardAccess(this.database.db, userId, id);
    if (!access) return null;

    const rows = await this.database.db
      .select(getTableColumns(boards))
      .from(boards)
      .where(eq(boards.id, id))
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
