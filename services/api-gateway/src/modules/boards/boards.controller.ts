import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { BoardsService } from './boards.service.js';
import type { BoardRow } from '@canvasflow/db';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/jwt.guard.js';
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
  async get(@Param('id') id: string): Promise<{ data: BoardRow }> {
    const data = await this.boards.findById(id);
    if (!data) {
      throw new NotFoundException(`Board ${id} not found`);
    }
    return { data };
  }
}
