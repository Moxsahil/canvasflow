import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { MentionsService, type MentionReport } from './mentions.service.js';

/** A comment or thread id as the editor makes them. */
const COMMENT_ID = /^[\w-]{1,80}$/;

/**
 * "I just posted, or edited, this comment" — from the author's editor, so the
 * people it names are emailed. Says which comment and nothing else; what the
 * email says is read from the board.
 */
@Controller('boards/:boardId/mentions')
export class MentionsController {
  private readonly env = parseEnv();

  constructor(private readonly mentions: MentionsService) {}

  /**
   * Thirty a minute per account, which a person writing comments never
   * reaches. Checks Origin, so another site cannot have a visitor's browser
   * report their comments. The board token works, as it does for a guest.
   */
  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe({ version: '4' })) boardId: string,
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: MentionReport }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }
    const { threadId, commentId } = (body ?? {}) as { threadId?: unknown; commentId?: unknown };
    if (
      typeof threadId !== 'string' ||
      !COMMENT_ID.test(threadId) ||
      typeof commentId !== 'string' ||
      !COMMENT_ID.test(commentId)
    ) {
      throw new BadRequestException('Send the threadId and commentId of the comment.');
    }
    return { data: await this.mentions.report(user.id, boardId, threadId, commentId) };
  }
}
