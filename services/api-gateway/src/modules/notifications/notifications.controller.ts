import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  getNotificationSettings,
  updateNotificationSettings,
  type NotificationSettingsRead,
} from '@canvasflow/db';
import { parseNotificationChanges, type NotificationSettings } from '@canvasflow/types';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { SYNC_PURPOSE, SyncInternalService } from '../../infra/sync/sync-internal.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';

/**
 * The account's email switches: what CanvasFlow may email it about.
 *
 * Only the caller's own, named by the token, so there is nothing here to probe.
 * A guest has no address and is refused both ways.
 *
 * A change is told to the account's other open tabs through the sync-server,
 * so a Settings window open elsewhere follows the switch within a second.
 */
@Controller('users/me/notifications')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
export class NotificationsController {
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly sync: SyncInternalService,
  ) {}

  /** Sixty a minute: read as Settings opens, and when another tab changes a switch. */
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // Another tab can flip a switch at any moment, so a stored copy is wrong.
  @Header('Cache-Control', 'private, no-store')
  async read(@CurrentUser() user: AuthenticatedUser): Promise<{ data: NotificationSettings }> {
    return { data: answer(await getNotificationSettings(this.database.db, user.id)) };
  }

  /**
   * Flip one or more switches — `{ "commentMentions": false }` — and answer
   * with all of them. Thirty a minute: a person clicking through every switch
   * twice stays well inside. Checks Origin, so another site cannot use a
   * visitor's signed-in browser to turn their email off.
   */
  @Patch()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: NotificationSettings }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    const parsed = parseNotificationChanges(body);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    const settings = answer(
      await updateNotificationSettings(this.database.db, user.id, parsed.changes),
    );
    this.sync.tell('/internal/account-changed', SYNC_PURPOSE.accountChanged, {
      userId: user.id,
      part: 'notifications',
    });
    return { data: settings };
  }
}

function answer(read: NotificationSettingsRead): NotificationSettings {
  if (read.ok) return read.settings;
  switch (read.reason) {
    case 'guest':
      throw new ForbiddenException('Create an account to get email from CanvasFlow.');
    case 'no-account':
      // A valid token for an account that is gone, as `users/me` answers it.
      throw new NotFoundException('Account not found');
  }
}
