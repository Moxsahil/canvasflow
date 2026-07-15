import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { BoardUpdatesService } from './board-updates.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard';

interface AppendUpdateBody {
  /** Base64-encoded Yjs update bytes. */
  update: string;
}

interface LoadResponse {
  data: {
    updates: string[];
    totalUpdates: number;
    totalBytes: number;
  };
}

interface AppendResponse {
  data: {
    id: string;
    createdAt: string;
  };
}

/**
 * REST endpoints for the Yjs update log.
 *
 * We transport binary updates as base64 in JSON. Alternative would be a
 * separate binary endpoint with application/octet-stream, but base64 keeps
 * the auth flow and error handling identical to the rest of the API.
 */
@Controller('boards/:boardId/updates')
@UseGuards(JwtAuthGuard)
export class BoardUpdatesController {
  constructor(private readonly updates: BoardUpdatesService) {}
  @Get()
  async list(
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<LoadResponse> {
    const result = await this.updates.loadUpdates(boardId, user.id);
    return {
      data: {
        updates: result.updates.map((u) => Buffer.from(u).toString('base64')),
        totalUpdates: result.totalUpdates,
        totalBytes: result.totalBytes,
      },
    };
  }

  @Post()
  async append(
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Body() body: AppendUpdateBody,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AppendResponse> {
    if (!body.update || typeof body.update !== 'string') {
      throw new Error('Missing update body');
    }

    const bytes = Buffer.from(body.update, 'base64');
    const result = await this.updates.appendUpdates(boardId, user.id, new Uint8Array(bytes));

    return {
      data: {
        id: result.id,
        createdAt: result.createdAt.toISOString(),
      },
    };
  }
}
