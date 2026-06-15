import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infra/database/database.service.js';
import { boards, memberships, type BoardRow } from '@canvasflow/db';
import { eq, isNull, and, inArray } from 'drizzle-orm';

@Injectable()
export class BoardsService {
  constructor(private readonly database: DatabaseService) {}

  async findAllForUser(userId: string): Promise<BoardRow[]> {
    const userWorkspaces = await this.database.db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(eq(memberships.userId, userId));

    const workspaceIds = userWorkspaces.map((w) => w.workspaceId);
    if (workspaceIds.length === 0) return [];

    return this.database.db
      .select()
      .from(boards)
      .where(and(inArray(boards.workspaceId, workspaceIds), isNull(boards.deletedAt)));
  }

  async findById(id: string): Promise<BoardRow | null> {
    const rows = await this.database.db
      .select()
      .from(boards)
      .where(and(eq(boards.id, id), isNull(boards.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }
}
