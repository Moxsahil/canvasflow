import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { getProfile } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard } from '../auth/jwt.guard.js';

/**
 * Who the caller is, according to the database rather than their token.
 *
 * The shape a client rebuilds its state from after a page load, and the reason
 * the access token carries nothing but an id: a name, an address or a
 * verification flag baked into a credential is a copy that goes stale the
 * moment the real one changes, and it keeps saying the old thing until the
 * token expires. Fifteen minutes of a confirmed address still being reported
 * as unconfirmed is exactly the trap this endpoint exists to avoid.
 *
 * No id in the path. The token names whose account this is, so no request here
 * can reach anybody else's — the same reasoning as the verification-status and
 * avatar routes.
 */
@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{ data: CurrentAccount }> {
    const profile = await getProfile(this.database.db, user.id);

    // A valid token for an account that is gone. Deleting somebody does not
    // reach into their browser, so this is ordinary rather than suspicious.
    if (!profile) throw new NotFoundException('Account not found');

    return {
      data: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
        avatarVersion: profile.avatarVersion,
        emailVerified: profile.emailVerified,
        isGuest: profile.isGuest,
      },
    };
  }
}

export interface CurrentAccount {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  avatarVersion: string | null;
  /** Read live, every call. Never from a claim. */
  emailVerified: boolean;
  isGuest: boolean;
}
