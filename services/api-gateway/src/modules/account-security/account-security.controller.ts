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
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { parseEnv } from '../../config/env.js';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { requestOrigin } from '../../common/request-origin.js';
import type { RequestContext } from '../auth/audit.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { passwordSchema } from '../auth/password-policy.js';
import {
  AccountSecurityService,
  type AccountSecurity,
  type SignedOut,
} from './account-security.service.js';

/**
 * Bounded before anything else runs, so an oversized body is refused before
 * any hashing. The new password is then held to the same policy as signup and
 * reset; the current one is checked only against the stored hash, never
 * against today's rules, which it may predate.
 */
const changeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().max(200),
  signOutOtherDevices: z.boolean().default(true),
});

/**
 * Account & Security for a signed-in account.
 *
 * Every route needs a signed-in account, from either credential the editor
 * holds: its board token or the session cookie. Both name the session they
 * came from, which is what "this device" means below.
 *
 * The two that change something also check Origin, so another site cannot use
 * a visitor's signed-in browser to do it; a missing Origin passes, as for
 * sign-out, because that is not a browser form.
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class AccountSecurityController {
  private readonly env = parseEnv();

  constructor(private readonly security: AccountSecurityService) {}

  /** What protects the account and where it is signed in, for the Settings pane. */
  @Get('users/me/security')
  async overview(@CurrentUser() user: AuthenticatedUser): Promise<{ data: AccountSecurity }> {
    const overview = await this.security.overview(user.id, user.sessionId);
    if (!overview) throw new NotFoundException('No account settings for this sign-in');
    return { data: overview };
  }

  /**
   * Change the password, with the current one.
   *
   * 400 for a wrong current password, one that breaks a rule, or one that
   * matches the current password; 429 once too many wrong answers have been
   * given for this account, sign-in's own limit. 200 says what happened to the
   * other devices.
   */
  @Post('auth/password/change')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async change(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
  ): Promise<{ data: { signedOut: SignedOut } }> {
    this.assertSameSite(origin);

    const parsed = changeSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Enter your current and new password');

    const policy = passwordSchema.safeParse(parsed.data.newPassword);
    if (!policy.success) {
      throw new BadRequestException(
        policy.error.issues[0]?.message ?? 'Choose a stronger password',
      );
    }

    const outcome = await this.security.changePassword(
      user.id,
      user.sessionId,
      { ...parsed.data, newPassword: policy.data },
      this.originOf(request),
      contextOf(request),
    );
    return { data: outcome };
  }

  /**
   * Email a link to add a password, for an account with only Google or GitHub.
   *
   * Limited per IP here and per address in the service — the same budget the
   * forgot-password route draws on, since it sends the same kind of link.
   */
  @Post('auth/password/setup-link')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async setupLink(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
  ): Promise<{ data: { status: 'sent' } }> {
    this.assertSameSite(origin);
    return {
      data: await this.security.sendSetupLink(user.id, this.originOf(request), contextOf(request)),
    };
  }

  private assertSameSite(origin: string | undefined): void {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }
  }

  private originOf(request: Request) {
    return requestOrigin(request, { trustEdgeHeaders: Boolean(this.env.ORIGIN_AUTH_SECRET) });
  }
}

/** Recorded for the audit trail, never used to decide anything. */
function contextOf(request: Request): RequestContext {
  return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
}
