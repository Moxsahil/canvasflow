import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';

/**
 * Cost factor for password hashing. High enough to be slow for an attacker
 * holding a stolen table, low enough that signing in does not feel stalled.
 */
const BCRYPT_ROUNDS = 12;

/**
 * Hashing and verification, kept in one place so the cost factor cannot drift
 * between where passwords are created and where they are checked.
 */
@Injectable()
export class PasswordService {
  /**
   * A hash of a value nobody knows, compared against when there is no stored
   * hash to compare with.
   *
   * This is what stops the clock from answering a question the error message
   * refuses to. Verifying a real password costs around 190ms at this cost
   * factor; a lookup that finds nothing costs a couple of milliseconds. Left
   * alone, an attacker learns which addresses have accounts by timing the
   * replies, and the identical "invalid email or password" buys nothing.
   *
   * Generated at startup from the same cost factor rather than written in as
   * a constant, so raising BCRYPT_ROUNDS cannot leave the decoy cheaper than
   * the real thing and quietly reopen the gap.
   */
  private readonly decoyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

  hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
  }

  /**
   * Whether a password matches, in constant-ish time whether or not there is
   * anything to match against.
   *
   * A null stored hash covers two cases that must not be distinguishable from
   * outside: no such account, and an account that only ever signed in with a
   * provider and so has no password at all. Both pay the full cost and both
   * answer false.
   */
  async verify(plaintext: string, storedHash: string | null): Promise<boolean> {
    if (storedHash) return bcrypt.compare(plaintext, storedHash);

    await bcrypt.compare(plaintext, this.decoyHash);
    return false;
  }
}
