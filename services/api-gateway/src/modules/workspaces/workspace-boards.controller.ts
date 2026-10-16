import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createBoardInWorkspace, listWorkspaceBoards, type BoardSummary } from '@canvasflow/db';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { MAX_BOARD_TITLE } from '../boards/board-details.js';
import { WorkspaceEventsService } from './workspace-events.service.js';

/**
 * The boards in one workspace — the editor sidebar's list — and the only place
 * new boards are created.
 *
 * Membership is the whole check, and it is made inside the one query each
 * handler runs rather than as a lookup before it. Both answer 404 for a
 * workspace the caller isn't in, exactly as for one that doesn't exist, so ids
 * can't be probed for existence.
 */
@Controller('workspaces/:workspaceId/boards')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
export class WorkspaceBoardsController {
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly events: WorkspaceEventsService,
  ) {}

  /**
   * A hundred and twenty a minute: the sidebar re-reads its lists whenever
   * anybody changes the workspace and whenever the window comes back, so a
   * busy team reaches further than one person clicking would.
   */
  @Get()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  // A board added, renamed or deleted by anybody makes any stored copy wrong.
  @Header('Cache-Control', 'private, no-store')
  async list(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: BoardSummary[] }> {
    const data = await listWorkspaceBoards(this.database.db, user.id, workspaceId);
    if (!data) throw new NotFoundException('Workspace not found');
    return { data };
  }

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async create(
    @Param('workspaceId', new ParseUUIDPipe({ version: '4' })) workspaceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: BoardSummary }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    // No title, or an unusable one, is a request for an untitled board.
    const raw = (body as { title?: unknown } | null)?.title;
    const title = typeof raw === 'string' ? raw.trim().slice(0, MAX_BOARD_TITLE) : '';

    const board = await createBoardInWorkspace(this.database.db, {
      userId: user.id,
      workspaceId,
      title: title || undefined,
    });
    if (!board) throw new NotFoundException('Workspace not found');

    this.events.changed(workspaceId);
    return { data: board };
  }
}
