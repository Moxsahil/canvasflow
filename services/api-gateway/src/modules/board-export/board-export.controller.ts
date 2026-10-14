import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { exportableBoards, exportableBoardSnapshots, type ExportableBoard } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { mergeSnapshots } from './merge-snapshots.js';

/**
 * Export all boards, from Settings → Data & Privacy.
 *
 * Only the boards the caller owns, in every workspace, and none in the trash.
 * The editor asks for the list, then for each board's saved document in turn,
 * and builds the download itself: it already reads boards with the engine's
 * own code and fetches images over signed URLs, so none of that is repeated
 * here, and no archive is ever held in this process.
 *
 * No id but the board's in any path, as for everything under `users/me`: the
 * credential says whose boards these are. Another person's board answers 404,
 * as one that does not exist does.
 */
@Controller('users/me/export')
@UseGuards(JwtAuthGuard)
export class BoardExportController {
  constructor(private readonly database: DatabaseService) {}

  @Get('boards')
  @Header('Cache-Control', 'private, no-store')
  async boards(@CurrentUser() user: AuthenticatedUser): Promise<{ data: ExportableBoard[] }> {
    return { data: await exportableBoards(this.database.db, user.id) };
  }

  /**
   * One board's document as Yjs bytes, ready for `Y.applyUpdate`. 204 for a
   * board that was never drawn on.
   */
  @Get('boards/:id')
  async board(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const snapshots = await exportableBoardSnapshots(this.database.db, user.id, id);
    if (!snapshots) throw new NotFoundException(`Board ${id} not found`);

    res.setHeader('Cache-Control', 'private, no-store');
    const document = mergeSnapshots(snapshots);
    if (!document) {
      res.status(204).end();
      return;
    }
    res.status(200).type('application/octet-stream').end(Buffer.from(document));
  }
}
