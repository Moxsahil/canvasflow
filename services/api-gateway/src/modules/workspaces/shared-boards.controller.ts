import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { listBoardsSharedWith, type SharedBoard } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';

/**
 * The boards someone was let onto by share link, outside their own
 * workspaces — what the editor's sidebar lists as "Shared with you".
 *
 * Without it, an account that joined somebody else's board had a sidebar
 * asking for that workspace's boards, which it may not see, and nothing to
 * get back to the board by but the link.
 *
 * Only the caller's own, so there is nothing here to probe. A guest without
 * an account is on exactly one board and has no sidebar list to fill; the
 * editor does not ask for one.
 */
@Controller('users/me/shared-boards')
export class SharedBoardsController {
  constructor(private readonly database: DatabaseService) {}

  /** Sixty a minute: read when the sidebar opens, and when something is shared or taken back. */
  @Get()
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // Being added to a board, or removed from one, makes any stored copy wrong.
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ data: SharedBoard[] }> {
    return { data: await listBoardsSharedWith(this.database.db, user.id) };
  }
}
