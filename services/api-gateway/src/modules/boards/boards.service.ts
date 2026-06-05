import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infra/database/database.service.js';
import { boards, type BoardRow } from '@canvasflow/db';
import { eq, isNull, and } from 'drizzle-orm';

@Injectable()
export class BoardsService {
  constructor(private readonly database: DatabaseService) {}

  async findAll(): Promise<BoardRow[]> {
    return this.database.db.select().from(boards).where(isNull(boards.deletedAt));
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
