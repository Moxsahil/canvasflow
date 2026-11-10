import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { VerificationService } from './verification.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';

/**
 * The authoritative answer to whether this address is confirmed yet.
 *
 * No id in the path: the token names whose status this is, so no request here
 * reaches anybody else's. Same reasoning as the avatar routes next door.
 *
 * Read live on every call rather than from a claim in the token. A session
 * minted before verification would otherwise keep saying "unconfirmed" until
 * it expired, which is the trap your section 11 describes.
 */
@Controller('users/me')
@UseGuards(JwtAuthGuard, AccountThrottlerGuard)
export class VerificationStatusController {
  constructor(private readonly verification: VerificationService) {}

  @Get('verification-status')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async status(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: { emailVerified: boolean } }> {
    return { data: { emailVerified: await this.verification.statusFor(user.id) } };
  }
}
