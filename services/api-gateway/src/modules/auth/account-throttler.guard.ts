import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * The rate limit, counted per account rather than per address.
 *
 * For routes behind a token guard, which has already said who is calling: a
 * whole office behind one address should not share one person's budget, and
 * one person should not get a fresh budget by changing networks. Listed after
 * the token guard so the account is known by the time this counts it; without
 * one it falls back to the address, as the stock guard does.
 *
 * In memory, like every limit here, so it costs no database call — see the
 * note on `ThrottlerModule` in the app module.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const user = (request as unknown as Request).user;
    return user?.id ? `account:${user.id}` : String(request.ip);
  }
}
