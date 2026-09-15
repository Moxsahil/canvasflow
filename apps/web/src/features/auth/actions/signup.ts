'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { createClient } from '@canvasflow/db';
import { users, verificationTokens } from '@canvasflow/db';
import { env } from '@/lib/env';
import { sql } from 'drizzle-orm';
import { sendVerificationEmail } from '@/lib/email/send-verification';

/**
 * The only gate that counts. `minLength` on the form is a convenience the
 * browser enforces and anything posting straight at this action ignores, so the
 * rules live here, where a request cannot get past them.
 *
 * Deliberately not applied to the sign-in schema in lib/auth: that one checks
 * the shape of a submitted credential before it is compared against a stored
 * hash, and tightening it would lock out every account created under the old
 * rule rather than making anybody safer.
 *
 * Not exported: a 'use server' file may only export async functions, and
 * exporting this breaks the whole module at runtime rather than at build.
 */
const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Z]/, 'Include a capital letter')
  .regex(/[0-9]/, 'Include a number')
  .regex(/[^A-Za-z0-9]/, 'Include a special character');

const signupSchema = z.object({
  // Trimmed, validated, then lowered. Every major provider treats an address
  // case-insensitively — the domain because DNS is, the local part because
  // RFC 5321 advises against relying on it and nobody does — so storing one
  // canonical form is what stops the same person holding two accounts.
  email: z.string().trim().email('Invalid email').toLowerCase(),
  password: passwordSchema,
  name: z.string().min(1, 'Name is required'),
});

export interface SignupResult {
  ok: boolean;
  error?: string;
}

export async function signup(input: unknown): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const db = createClient(env.DATABASE_URL);
  // Compared case-insensitively rather than against the lowered value alone:
  // rows written before this normalisation still carry their original casing,
  // and an exact match would not see them — offering a second account on an
  // address that already has one.
  const existing = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${parsed.data.email}`)
    .limit(1);

  if (existing.length > 0) {
    return { ok: false, error: 'An account with that email already exists' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await db.insert(users).values({
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash,
  });

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(verificationTokens).values({
    identifier: parsed.data.email,
    token,
    expires,
  });

  const verifyUrl = `${env.AUTH_URL}/verify?token=${token}&email=${encodeURIComponent(parsed.data.email)}`;
  await sendVerificationEmail(parsed.data.email, verifyUrl);

  return { ok: true };
}
