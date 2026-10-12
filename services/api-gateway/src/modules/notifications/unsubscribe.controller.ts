import {
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { updateNotificationSettings } from '@canvasflow/db';
import { isNotificationKind, type NotificationKind } from '@canvasflow/types';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { SYNC_PURPOSE, SyncInternalService } from '../../infra/sync/sync-internal.service.js';
import { isUnsubscribeToken } from './unsubscribe-token.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turning one kind of email off from the email itself, without signing in.
 *
 * Posted to by a mail client's own unsubscribe button (RFC 8058), which sends
 * the link's query and a form body this route has no use for, and by the web
 * app's unsubscribe page once its button is pressed. Never on a GET: a mail
 * scanner opening every link must not turn anybody's email off.
 *
 * The token in the link is the whole credential, and all it can do is turn
 * off the one switch it was minted for. Turning it back on is Settings'.
 */
@Controller('notifications/unsubscribe')
export class UnsubscribeController {
  private readonly env = parseEnv();

  constructor(
    private readonly database: DatabaseService,
    private readonly sync: SyncInternalService,
  ) {}

  /** Thirty a minute per address: a person presses it once. */
  @Post()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribe(
    @Query('u') userId: unknown,
    @Query('k') kind: unknown,
    @Query('t') token: unknown,
  ): Promise<{ data: { kind: NotificationKind; on: false } }> {
    if (typeof userId !== 'string' || !UUID.test(userId) || !isNotificationKind(kind)) {
      throw new BadRequestException('This unsubscribe link is incomplete.');
    }
    if (!isUnsubscribeToken(this.env.AUTH_SECRET, userId, kind, token)) {
      throw new ForbiddenException('This unsubscribe link isn’t valid.');
    }

    const saved = await updateNotificationSettings(this.database.db, userId, { [kind]: false });
    if (!saved.ok) throw new NotFoundException('This account no longer exists.');

    this.sync.tell('/internal/account-changed', SYNC_PURPOSE.accountChanged, {
      userId,
      part: 'notifications',
    });
    return { data: { kind, on: false } };
  }
}
