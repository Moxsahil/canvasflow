import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseEnv } from '../../config/env.js';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { requestOrigin } from '../../common/request-origin.js';
import type { RequestContext } from '../auth/audit.service.js';
import { clearSessionCookies } from '../auth/auth-cookies.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { AccountDeletionService, type DeletionPreview } from './account-deletion.service.js';

/**
 * Bounded before anything else runs, so an oversized body is refused before
 * any hashing. The password is checked only against the stored hash, never
 * against today's rules, which it may predate.
 */
const requestSchema = z.object({
  confirmEmail: z.string().max(320),
  currentPassword: z.string().min(1).max(200).optional(),
});

/**
 * Deleting your own account.
 *
 * No id in the path, as for everything under `users/me`: the credential names
 * whose account this is, so no request here can reach anybody else's. Guarded
 * by either credential the editor holds, both of which name the session they
 * came from — which is what the recent sign-in check goes by.
 */
@Controller('users/me/deletion')
@UseGuards(JwtAuthGuard)
export class AccountDeletionController {
  private readonly env = parseEnv();

  constructor(private readonly deletion: AccountDeletionService) {}

  /** What deleting the account would take, and how to confirm it, for the screen that asks. */
  @Get()
  async preview(@CurrentUser() user: AuthenticatedUser): Promise<{ data: DeletionPreview }> {
    const preview = await this.deletion.preview(user.id, user.sessionId);
    if (!preview) throw new NotFoundException('There is no account here to delete.');
    return { data: preview };
  }

  /**
   * Ask for the account to be deleted.
   *
   * 400 for an address that does not match or a wrong password; 403 with
   * `code: 'recent-sign-in-required'` when an account with no password last
   * signed in too long ago; 409 when something stands in the way; 429 once too
   * many wrong passwords have been given for this account, sign-in's own limit.
   *
   * 200 says when the erasure runs. Every session has ended by then, so this
   * browser's cookies are cleared on the way out rather than left holding a
   * credential that no longer works. Checks Origin, so another site cannot use
   * a visitor's signed-in browser to do this.
   */
  @Post()
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: { purgeAfter: string } }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    const parsed = requestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Type your email address to confirm.');

    const outcome = await this.deletion.request(
      user.id,
      user.sessionId,
      parsed.data,
      requestOrigin(request, { trustEdgeHeaders: Boolean(this.env.ORIGIN_AUTH_SECRET) }),
      contextOf(request),
    );

    clearSessionCookies(response);
    return { data: outcome };
  }
}

/** Recorded for the audit trail, never used to decide anything. */
function contextOf(request: Request): RequestContext {
  return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
}
