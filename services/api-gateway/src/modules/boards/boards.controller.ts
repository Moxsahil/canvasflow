import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { BoardsService } from './boards.service.js';
import {
  boardOverview,
  resolveBoardAccess,
  type BoardOverview,
  type BoardRow,
  type BoardRole,
} from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { JwtAuthGuard } from '../auth/jwt.guard.js';
import type { AuthenticatedUser } from '../auth/jwt.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

const DEFAULT_BOARD_TITLE = 'Untitled board';

const createBoardSchema = z.object({
  title: z.string().trim().min(1).max(200).default(DEFAULT_BOARD_TITLE),
});

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(
    private readonly boards: BoardsService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: BoardRow[] }> {
    const data = await this.boards.findAllForUser(user.id);
    return { data };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: BoardRow }> {
    const parsed = createBoardSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? 'Invalid board payload');
    }

    const data = await this.boards.createForUser({
      userId: user.id,
      userName: user.name,
      title: parsed.data.title,
    });
    return { data };
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: BoardRow }> {
    const data = await this.boards.findByIdForUser(id, user.id);
    if (!data) {
      // Intentionally 404, not 403. Returning "forbidden" tells an attacker
      // the resource exists, which is itself an info leak.
      throw new NotFoundException(`Board ${id} not found`);
    }
    return { data };
  }

  /**
   * The board's name, tag colour and owner, and the caller's own role on it —
   * what the Share window shows someone who is not the owner.
   *
   * Anyone who can open the board may read it, including a guest with only the
   * editor's own token: it says nothing they cannot already see on the board,
   * apart from whose it is. Everyone else gets 404, as for a board that does
   * not exist.
   */
  @Get(':id/overview')
  @Header('Cache-Control', 'private, no-store')
  async overview(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: BoardOverview & { role: BoardRole } }> {
    const db = this.database.db;
    const access = await resolveBoardAccess(db, user.id, id);
    const board = access && (await boardOverview(db, id));
    if (!access || !board) throw new NotFoundException(`Board ${id} not found`);
    return { data: { ...board, role: access.role } };
  }
}
