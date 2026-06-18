import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { BoardsService } from './boards.service.js';
import type { BoardRow } from '@canvasflow/db';
import { JwtAuthGuard } from '../auth/jwt.guard.js';
import type { AuthenticatedUser } from '../auth/jwt.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: BoardRow[] }> {
    const data = await this.boards.findAllForUser(user.id);
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
}
