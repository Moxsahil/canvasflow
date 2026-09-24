import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
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
import { passwordSchema } from '../auth/password-policy.js';
import {
  PasswordResetService,
  type ResetCheck,
  type ResetOutcome,
} from './password-reset.service.js';
import { RESET_TOKEN_PATTERN } from './reset-token.service.js';

/**
 * Normalised exactly as sign-in normalises, so the address counted by the
 * limiter and matched against accounts is the one sign-in would match.
 */
const forgotSchema = z.object({
  email: z.string().trim().max(320).email('Enter a valid email address').toLowerCase(),
});

/**
 * Anything that is not 43 base64url characters was never issued here, so it
 * is refused before it reaches the database: walking the token space costs a
 * regex, not a query.
 */
const tokenSchema = z.object({
  token: z.string().regex(RESET_TOKEN_PATTERN, 'Invalid token'),
});

/**
 * Bounded before the policy runs so an oversized body is refused before any
 * work; the policy itself (password-policy.ts) is what the new password has
 * to meet, the same rules signup applies.
 */
const resetSchema = tokenSchema.extend({
  password: z.string().max(200),
});

/**
 * Password recovery. Every route here is reached without a session: the
 * person has forgotten the password that would give them one.
 */
@Controller('auth/password')
export class PasswordResetController {
  private readonly env = parseEnv();

  constructor(private readonly resets: PasswordResetService) {}

  /**
   * Ask for a reset link.
   *
   * 202 for every well-formed address, account or not. Nothing in the status,
   * the body or the time taken says whether an account exists; the only
   * difference is a mail in the inbox of whoever owns the address.
   *
   * Limited per IP here and per address in the service. Both refusals are the
   * same for real and unknown addresses.
   *
   * The Origin check stops another site from using a visitor's browser to send
   * reset mails. A missing Origin passes, as it does for sign-out: that is not
   * a browser form.
   */
  @Post('forgot')
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async forgot(
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
  ): Promise<{ data: { status: 'accepted' } }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    const parsed = forgotSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException('Enter a valid email address');
    }

    await this.resets.request(parsed.data.email, this.originOf(request), contextOf(request));
    return { data: { status: 'accepted' } };
  }

  /**
   * Whether a reset link can still be used. Never spends it.
   *
   * The reset page calls this as it opens, which is also the moment a mail
   * scanner would fetch the page — the reason opening a link has to be
   * harmless.
   */
  @Post('reset/check')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async check(
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: ResetCheck }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    const parsed = tokenSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('Invalid token');

    return { data: await this.resets.check(parsed.data.token) };
  }

  /**
   * Replace the password with a reset link.
   *
   * 200 with `ok: false` for a link that cannot be used, the same shape the
   * verification route uses, so the page can say "expired" or "no longer
   * valid" rather than a generic failure. 400 only for a password that breaks
   * a rule or matches the current one.
   *
   * On success the session cookies are cleared as well. Every session was just
   * ended, and the refresh cookie is scoped to `/auth` — so this route is one
   * of the few that receives it, and can take it away rather than leave a dead
   * credential in the browser.
   *
   * No session is started. The person signs in with the new password through
   * the ordinary form, which keeps session creation in one place and stays
   * correct when a second factor exists: a reset must never skip one.
   */
  @Post('reset')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async reset(
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: ResetOutcome }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    const parsed = resetSchema.safeParse(body ?? {});
    if (!parsed.success) {
      const issues = parsed.error.issues;
      if (issues.some((issue) => issue.path[0] === 'token')) {
        throw new BadRequestException('Invalid token');
      }
      const tooLong = issues.some((issue) => issue.code === 'too_big');
      throw new BadRequestException(tooLong ? 'Choose a shorter password' : 'Enter a new password');
    }

    // Checked before the link is even looked up, so a weak password costs
    // nothing but this.
    const policy = passwordSchema.safeParse(parsed.data.password);
    if (!policy.success) {
      throw new BadRequestException(
        policy.error.issues[0]?.message ?? 'Choose a stronger password',
      );
    }

    const outcome = await this.resets.complete(
      parsed.data.token,
      policy.data,
      this.originOf(request),
      contextOf(request),
    );

    if (outcome.ok) clearSessionCookies(response);
    return { data: outcome };
  }

  /**
   * The edge's country header is believed only when the origin lock is on,
   * which is what guarantees the request came through the edge at all.
   */
  private originOf(request: Request) {
    return requestOrigin(request, { trustEdgeHeaders: Boolean(this.env.ORIGIN_AUTH_SECRET) });
  }
}

/** Recorded for the audit trail, never used to decide anything. */
function contextOf(request: Request): RequestContext {
  return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
}
