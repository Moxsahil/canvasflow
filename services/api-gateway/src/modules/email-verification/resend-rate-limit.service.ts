import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt } from 'drizzle-orm';
import { emailVerificationTokens } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';

/**
 * Starting figures for how often one account may ask for a link.
 *
 * Tuned from real traffic later rather than treated as settled. The shape is
 * what matters: a short bar against hammering the button, and longer ones so a
 * patient caller cannot spend the day mailing somebody.
 */
const LIMITS = [
  { windowMs: 60_000, max: 1 },
  { windowMs: 60 * 60_000, max: 5 },
  { windowMs: 24 * 60 * 60_000, max: 10 },
] as const;

const LONGEST_WINDOW_MS = Math.max(...LIMITS.map((limit) => limit.windowMs));

export type ResendAllowance = { allowed: true } | { allowed: false; retryAfterSeconds: number };

@Injectable()
export class ResendRateLimiter {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Whether this account may ask for another link, and if not, when it may.
   *
   * Counted from the challenge rows themselves rather than from a counter in
   * memory. Two things follow: the limit survives a restart and holds across
   * every instance of this service, and there is nothing new to store, because
   * issuing a token already leaves a row behind. A cache buys nothing until a
   * per-IP limit needs to count something that is not a row.
   */
  async check(userId: string): Promise<ResendAllowance> {
    const since = new Date(Date.now() - LONGEST_WINDOW_MS);

    const rows = await this.database.db
      .select({ createdAt: emailVerificationTokens.createdAt })
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          gt(emailVerificationTokens.createdAt, since),
        ),
      )
      .orderBy(desc(emailVerificationTokens.createdAt));

    const now = Date.now();
    let retryAfterMs = 0;

    for (const limit of LIMITS) {
      const cutoff = now - limit.windowMs;
      const inWindow = rows.filter((row) => row.createdAt.getTime() > cutoff);
      if (inWindow.length < limit.max) continue;

      // Newest first, so the one at the limit is the request whose leaving the
      // window frees a slot. Whichever limit frees last is the binding one.
      const blocking = inWindow[limit.max - 1];
      if (!blocking) continue;
      retryAfterMs = Math.max(retryAfterMs, blocking.createdAt.getTime() + limit.windowMs - now);
    }

    if (retryAfterMs <= 0) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }
}
