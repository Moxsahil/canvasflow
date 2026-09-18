import { ConflictException, Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';
import { users } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';
import { VerificationService } from '../email-verification/verification.service.js';

/**
 * Cost factor for password hashing. High enough to be slow for an attacker
 * holding a stolen table, low enough that signing up does not feel stalled.
 */
const BCRYPT_ROUNDS = 12;

export interface SignupInput {
  email: string;
  password: string;
  name: string;
}

export interface SignupResult {
  /**
   * Whether the provider took the verification mail. The account exists either
   * way, which is the point: delivery is not part of creating one.
   */
  emailSent: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly verification: VerificationService,
  ) {}

  /**
   * Create an account, then put a verification link in front of its owner.
   *
   * The address is unconfirmed when this returns, and stays that way until the
   * link is followed. Nothing here waits on the mail.
   */
  async signup(input: SignupInput): Promise<SignupResult> {
    const db = this.database.db;

    // Compared case-insensitively rather than against the lowered value alone:
    // rows written before addresses were normalised still carry their original
    // casing, and an exact match would not see them, offering a second account
    // on an address that already has one.
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('An account with that email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    let userId: string;
    try {
      const [created] = await db
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash })
        .returning({ id: users.id });

      if (!created) throw new Error('User row was not returned after insert');
      userId = created.id;
    } catch (error) {
      // Two requests for the same new address can both clear the check above.
      // The unique index is what actually decides, so its refusal has to give
      // the same answer the check would have.
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with that email already exists');
      }
      throw error;
    }

    const emailSent = await this.verification.sendChallenge(userId, input.email);

    return { emailSent };
  }
}

/** Postgres `unique_violation`. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
  );
}
