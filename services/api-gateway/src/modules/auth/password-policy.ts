import { z } from 'zod';

/**
 * The longest password accepted anywhere a password is chosen.
 *
 * bcrypt reads only the first 72 bytes of its input and silently ignores the
 * rest, so without a ceiling two passwords sharing a long prefix are the same
 * password. 64 characters stays under that for ordinary text and is the
 * smallest maximum NIST SP 800-63B allows.
 */
export const PASSWORD_MAX_LENGTH = 64;

/**
 * The rules for choosing a password: signup, reset, and anywhere else one is
 * set. One definition, because two copies are how a reset ends up accepting a
 * password that signup would refuse.
 *
 * Checking a password at sign-in is deliberately not this — see signInSchema.
 * A stored hash that predates a rule still has to match.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .regex(/[A-Z]/, 'Include a capital letter')
  .regex(/[0-9]/, 'Include a number')
  .regex(/[^A-Za-z0-9]/, 'Include a special character');
