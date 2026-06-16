import NextAuth from 'next-auth';
import { authConfig } from './config';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import {
  createClient,
  users,
  authAdapterUsers,
  authAdapterAccounts,
  authAdapterSessions,
  authAdapterVerificationTokens,
} from '@canvasflow/db';
import { eq } from 'drizzle-orm';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import z from 'zod';
import { env } from '@/lib/env';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const db = createClient(env.DATABASE_URL);

export const { auth, handlers, signOut, signIn } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: authAdapterUsers,
    accountsTable: authAdapterAccounts,
    sessionsTable: authAdapterSessions,
    verificationTokensTable: authAdapterVerificationTokens,
  }),
  providers: [
    Google({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const result = await db
          .select()
          .from(users)
          .where(eq(users.email, parsed.data.email))
          .limit(1);

        const user = result[0];

        if (!user || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatarUrl,
        };
      },
    }),
  ],
});
