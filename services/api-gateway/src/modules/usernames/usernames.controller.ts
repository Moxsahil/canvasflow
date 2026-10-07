import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  NotFoundException,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { parseUsername, updateProfile, usernameHolders, type Profile } from '@canvasflow/db';
import { isAllowedOrigin } from '../../common/allowed-origins.js';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { AccountThrottlerGuard } from '../auth/account-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type AuthenticatedUser, JwtAuthGuard, SignedTokenGuard } from '../auth/jwt.guard.js';
import {
  answerChecks,
  namesAsked,
  planChecks,
  TAKEN,
  type UsernameCheck,
} from './username-checks.js';

/**
 * The account's username: whether names are free, and claiming one.
 *
 * Here rather than with the display name in the web app because this is the
 * service that knows who somebody is, and the one with rate limits. Usernames
 * are for finding people only — nothing signs anybody in with one.
 *
 * Both answers are as quick as they can be made. A check is one indexed read
 * and nothing else: the caller is known by the token's signature, the budget
 * is counted in memory, and the request carries no header that would make the
 * browser send a preflight first. A claim is the session read every change
 * needs, then one update that also refuses guests and lets the unique
 * constraint settle a race; it answers with the profile, so the editor needs
 * no second request to show it.
 */
@Controller('users/me/username')
export class UsernamesController {
  private readonly env = parseEnv();

  constructor(private readonly database: DatabaseService) {}

  /**
   * `?name=` once for the name being typed, or several times — up to ten —
   * for a suggestion and its fallbacks. Answers in the order asked.
   *
   * Sixty a minute per account: the field asks once typing pauses and
   * remembers what it was told, so a person typing never comes close.
   */
  @Get()
  @UseGuards(SignedTokenGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  // An answer about who holds a name is stale the moment somebody claims it.
  @Header('Cache-Control', 'private, no-store')
  async check(
    @CurrentUser() user: AuthenticatedUser,
    @Query('name') query: unknown,
  ): Promise<{ data: UsernameCheck[] }> {
    const asked = namesAsked(query);
    if (!asked.ok) throw new BadRequestException(asked.error);

    const { parsed, lookups } = planChecks(asked.names);
    const holders = await usernameHolders(this.database.db, lookups);
    return { data: answerChecks(parsed, holders, user.id) };
  }

  /**
   * Claim a username, or change to another. 400 for one that breaks a rule,
   * 409 when somebody holds it, 403 for a guest. Checks Origin, so another
   * site cannot use a visitor's signed-in browser to do this.
   */
  @Patch()
  @UseGuards(JwtAuthGuard, AccountThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async claim(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
  ): Promise<{ data: Profile }> {
    if (!isAllowedOrigin(origin, this.env)) {
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    const parsed = parseUsername((body as { username?: unknown } | null)?.username);
    if (!parsed.ok) throw new BadRequestException(parsed.error);

    const saved = await updateProfile(this.database.db, user.id, { username: parsed.username });
    if (saved.ok) return { data: saved.profile };
    switch (saved.reason) {
      case 'username-taken':
        throw new ConflictException(TAKEN);
      case 'guest':
        throw new ForbiddenException('Create an account to choose a username.');
      case 'no-account':
        // A valid token for an account that is gone, as `users/me` answers it.
        throw new NotFoundException('Account not found');
    }
  }
}
