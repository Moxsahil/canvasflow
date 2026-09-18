import { Controller, Get, UseGuards } from '@nestjs/common';
import { VerificationService } from './verification.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';

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
@UseGuards(JwtAuthGuard)
export class VerificationStatusController {
  constructor(private readonly verification: VerificationService) {}

  @Get('verification-status')
  async status(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: { emailVerified: boolean } }> {
    return { data: { emailVerified: await this.verification.statusFor(user.id) } };
  }
}
