import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { BoardsService } from './boards.service.js';
import type { BoardRow } from '@canvasflow/db';

@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  async list(): Promise<{ data: BoardRow[] }> {
    const data = await this.boards.findAll();
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
