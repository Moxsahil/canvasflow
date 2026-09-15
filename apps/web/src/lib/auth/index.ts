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
import { sql } from 'drizzle-orm';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import z from 'zod';
import { env } from '@/lib/env';

const credentialsSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
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

        // Case-insensitive on purpose. The address is lowered on the way in,
        // but accounts created before that still hold mixed case, and an exact
        // match would lock their owners out of their own accounts.
        //
        // No limit, and every candidate is checked. Addresses that differ only
        // by case were allowed to register twice before this, so a handful of
        // them still map to two rows; taking the first would be a coin flip
        // that fails the password check on an account the person really owns.
        // The password is what says which one they meant. Once the duplicates
        // are merged this is a one-row query and behaves exactly as before.
        const candidates = await db
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${parsed.data.email}`);

        let user: (typeof candidates)[number] | undefined;
        for (const candidate of candidates) {
          if (!candidate.passwordHash) continue;
          if (await bcrypt.compare(parsed.data.password, candidate.passwordHash)) {
            user = candidate;
            break;
          }
        }

        if (!user) return null;

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
