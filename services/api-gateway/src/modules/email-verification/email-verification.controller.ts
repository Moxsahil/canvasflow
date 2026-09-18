import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  VerificationService,
  type ResendResult,
  type VerificationOutcome,
} from './verification.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

/**
 * Thirty-two bytes as base64url is exactly 43 characters from this alphabet.
 * Anything else was never issued here, so it is refused before it reaches the
 * database: someone walking the URL space costs a regex rather than a query.
 */
const verifySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid token'),
});

@Controller('auth/email')
export class EmailVerificationController {
  constructor(private readonly verification: VerificationService) {}

  /**
   * Unguarded, because whoever follows the link has no session yet. The token
   * is the credential, and it authorises exactly one thing.
   *
   * POST rather than GET on purpose. Mail scanners and link previews fetch a
   * URL before anybody clicks it, and a GET that spent a token would be spent
   * by them, leaving a real person with a link that was already used.
   */
  @Post('verify')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verify(@Body() body: unknown): Promise<{ data: VerificationOutcome }> {
    const parsed = verifySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException('Invalid token');
    }

    return { data: await this.verification.verify(parsed.data.token) };
  }

  /**
   * Another link for the account making the request.
   *
   * Guarded, and takes no body at all: the address comes from the user record
   * behind the token, so there is nothing here to point somewhere else.
   *
   * A refusal answers 429 for anything watching traffic, and repeats the wait
   * in the body because the editor is on another origin and cannot read a
   * Retry-After header unless CORS is changed to expose it.
   */
  @Post('resend')
  @UseGuards(ThrottlerGuard, JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  async resend(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: ResendResult }> {
    const result = await this.verification.resend(user.id);

    if (result.status === 'rate-limited') {
      response.status(429);
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
    }

    return { data: result };
  }
}
