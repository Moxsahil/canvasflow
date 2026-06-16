import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infra/database/database.service.js';
import { boards, memberships, type BoardRow } from '@canvasflow/db';
import { eq, isNull, and, inArray } from 'drizzle-orm';

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
   */
  async findByIdForUser(id: string, userId: string): Promise<BoardRow | null> {
    const workspaceIds = await this.getUserWorkspaceIds(userId);
    if (workspaceIds.length === 0) return null;

    const rows = await this.database.db
      .select()
      .from(boards)
      .where(
        and(eq(boards.id, id), inArray(boards.workspaceId, workspaceIds), isNull(boards.deletedAt)),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  private async getUserWorkspaceIds(userId: string): Promise<string[]> {
    const rows = await this.database.db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    return rows.map((r) => r.workspaceId);
  }
}
