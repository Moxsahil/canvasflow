'use server';

import { z } from 'zod';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { createClient } from '@canvasflow/db';
import { users, verificationTokens } from '@canvasflow/db';
import { env } from '@/lib/env';
import { eq } from 'drizzle-orm';
import { sendVerificationEmail } from '@/lib/email/send-verification';
import type { HexColor } from '@canvasflow/types';

const signupSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
  const existing = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);

  if (existing.length > 0) {
    return { ok: false, error: 'An account with that email already exists' };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await db.insert(users).values({
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash,
    preferences: {
      theme: 'system',
      cursorColor: '#6366f1' as HexColor,
      showCursorsOfOthers: true,
      defaultBoardTool: 'select',
    },
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
