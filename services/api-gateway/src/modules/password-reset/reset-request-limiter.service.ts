import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { passwordResetRequests } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';

/**
 * How often one address may be sent a reset link.
 *
 * A short bar against hammering the button, and an hourly one so a patient
 * caller cannot spend the day filling somebody's inbox.
 *
 * Deliberately no daily cap. Anybody who knows an address can trip this limit
 * for it — that is what "keyed on what was typed" means — and a day-long window
 * would let them block that person's recovery for a whole day. An hour bounds
 * the harm; the per-IP limit and the edge make sustaining it expensive.
 */
const LIMITS = [
  { windowMs: 60_000, max: 1 },
  { windowMs: 60 * 60_000, max: 5 },
] as const;

const LONGEST_WINDOW_MS = Math.max(...LIMITS.map((limit) => limit.windowMs));
const MOST_ROWS_READ = Math.max(...LIMITS.map((limit) => limit.max));

/**
 * A refusal that is about pace.
 *
 * Identical for an address with an account and one without, because it is
 * counted from what was typed. Carries the wait in the body as well as the
 * header, since the browser calls this cross-origin and cannot read
 * `Retry-After` unless CORS is changed to expose it.
 */
export class ResetThrottledException extends HttpException {
  constructor(retryAfterSeconds: number) {
    super(
      {
        message: 'Too many reset requests for this address. Try again shortly.',
        error: 'TooManyRequests',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export type ResetAllowance = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Counts reset requests against the address they were made for.
 *
 * Keyed on the address as submitted, account or no account. Counting only real
 * accounts would make a 429 a way to discover which addresses exist; counting
 * what was typed makes the refusal say nothing at all. Stored as a digest for
 * the same reason `sign_in_failures` is: many of these addresses were typed by
 * somebody who does not own them.
 *
 * Counted from rows rather than memory, so the limit survives a deploy and
 * holds across instances.
 */
@Injectable()
export class ResetRequestLimiter {
  constructor(private readonly database: DatabaseService) {}

  private key(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /**
   * Admit one request, or say how long to wait.
   *
   * Refused requests are not recorded. If they were, somebody spamming an
   * address would keep its window full for ever; as it is, the window empties
   * on schedule however hard it is hit.
   *
   * The count and the insert are two statements, so two requests landing in
   * the same instant can both be admitted. That is one extra mail at worst, and
   * the per-IP limit in front of this bounds how often it can happen.
   */
  async admit(email: string): Promise<ResetAllowance> {
    const key = this.key(email);
    const now = Date.now();

    const rows = await this.database.db
      .select({ createdAt: passwordResetRequests.createdAt })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.emailHash, key),
          gt(passwordResetRequests.createdAt, new Date(now - LONGEST_WINDOW_MS)),
        ),
      )
      .orderBy(desc(passwordResetRequests.createdAt))
      .limit(MOST_ROWS_READ);

    let retryAfterMs = 0;
    for (const limit of LIMITS) {
      const inWindow = rows.filter((row) => row.createdAt.getTime() > now - limit.windowMs);
      if (inWindow.length < limit.max) continue;

      // Newest first, so the one at the limit is the request whose leaving the
      // window frees a slot. Whichever limit frees last is the binding one.
      const blocking = inWindow[limit.max - 1];
      if (!blocking) continue;
      retryAfterMs = Math.max(retryAfterMs, blocking.createdAt.getTime() + limit.windowMs - now);
    }

    if (retryAfterMs > 0) {
      return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
    }

    await this.database.db.insert(passwordResetRequests).values({ emailHash: key });
    return { allowed: true };
  }
}
