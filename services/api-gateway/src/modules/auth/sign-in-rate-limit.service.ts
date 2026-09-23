import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { signInFailures } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';

/**
 * How many wrong answers one address may give, and over what stretch.
 *
 * One window, deliberately. Tiering it over hours or a day would mean a longer
 * refusal, and a refusal is something an attacker can aim at somebody else:
 * anyone who knows an address can spend ten wrong guesses on it. Keeping the
 * only window short bounds that to fifteen minutes from the last attempt,
 * which is the shape the plan asks for — slow the guessing down, never lock an
 * account in a way that has to be undone by hand.
 *
 * Ten is generous for a person. Someone mistyping, or a password manager
 * filling the wrong entry, is two or three. Ten in a quarter of an hour is
 * already somebody working at it.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

export type SignInAllowance = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * A refusal that is about pace rather than credentials.
 *
 * Carries the wait in its body as well as its status, because the browser
 * calls this cross-origin and cannot read a `Retry-After` header unless CORS
 * is changed to expose it — the same reason the resend route repeats it.
 */
export class SignInThrottledException extends HttpException {
  constructor(retryAfterSeconds: number) {
    super(
      {
        message: 'Too many sign-in attempts. Try again shortly.',
        error: 'TooManyRequests',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Counts failed sign-ins against the address they were attempted on.
 *
 * Everything here keys on the address as submitted, whether or not it belongs
 * to anybody. Counting only real accounts would make being refused for pace a
 * way to discover which addresses exist — the same disclosure the single
 * "Invalid email or password" message and the decoy hash exist to prevent.
 */
@Injectable()
export class SignInRateLimiter {
  constructor(private readonly database: DatabaseService) {}

  private key(email: string): string {
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  }

  /**
   * Whether this address may be tried again, and if not, when.
   *
   * Asked before any lookup or hashing, so a refusal costs an indexed count
   * rather than the ~190ms a bcrypt comparison takes.
   */
  async check(email: string): Promise<SignInAllowance> {
    const since = new Date(Date.now() - WINDOW_MS);

    const rows = await this.database.db
      .select({ createdAt: signInFailures.createdAt })
      .from(signInFailures)
      .where(
        and(eq(signInFailures.emailHash, this.key(email)), gt(signInFailures.createdAt, since)),
      )
      .orderBy(asc(signInFailures.createdAt))
      .limit(MAX_FAILURES);

    if (rows.length < MAX_FAILURES) return { allowed: true };

    // The oldest failure still inside the window is the one whose leaving it
    // frees the next attempt.
    const oldest = rows[0];
    if (!oldest) return { allowed: true };

    const retryAfterMs = oldest.createdAt.getTime() + WINDOW_MS - Date.now();
    if (retryAfterMs <= 0) return { allowed: true };

    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  /** Remember a wrong answer. */
  async record(email: string): Promise<void> {
    await this.database.db.insert(signInFailures).values({ emailHash: this.key(email) });
  }

  /**
   * Forget this address's failures.
   *
   * Proving the password is the end of the matter: somebody who mistyped nine
   * times and then got it right starts from nothing, rather than carrying a
   * near-full budget into their next session.
   */
  async clear(email: string): Promise<void> {
    await this.database.db
      .delete(signInFailures)
      .where(eq(signInFailures.emailHash, this.key(email)));
  }
}
