import NextAuth from 'next-auth';
import { authConfig } from './config';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import {
  createClient,
  users,
  authAdapterUsers,
  authAdapterAccounts,
  authAdapterSessions,
} from '@canvasflow/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
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

const GITHUB_API = 'https://api.github.com';

/**
 * GitHub's profile, carrying the flag GitHub itself reports and the stock
 * provider discards.
 *
 * The default implementation reads `/user`, and only falls back to
 * `/user/emails` when there is no public address — taking the primary one and
 * dropping the `verified` field beside it. That field is the entire question
 * here, so this always reads the list and keeps it.
 *
 * Reported as `email_verified` on purpose: that is the claim Google returns,
 * so whatever consumes this does not need to know which provider it came from.
 *
 * A failure to read the list is not an error. It leaves the flag false, and
 * false only means the address goes through the ordinary email flow.
 */
async function githubProfileWithVerification(
  accessToken: string,
): Promise<Record<string, unknown>> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'authjs',
  };

  const profile = (await fetch(`${GITHUB_API}/user`, { headers }).then((res) =>
    res.json(),
  )) as Record<string, unknown> & { email?: string | null };

  const emails = (await fetch(`${GITHUB_API}/user/emails`, { headers })
    .then((res) => (res.ok ? res.json() : []))
    .catch(() => [])) as Array<{ email: string; primary: boolean; verified: boolean }>;

  // The address this sign-in will actually use, then that address's own flag.
  // Matching on the public address first matters: an account may have several
  // confirmed addresses and one unconfirmed, and the primary one is not
  // necessarily the one being presented.
  const chosen =
    (profile.email ? emails.find((entry) => entry.email === profile.email) : undefined) ??
    emails.find((entry) => entry.primary) ??
    emails[0];

  return {
    ...profile,
    email: profile.email ?? chosen?.email ?? null,
    email_verified: chosen?.verified === true,
  };
}

export const { auth, handlers, signOut, signIn } = NextAuth({
  ...authConfig,
  // No verificationTokensTable: the adapter's type has it optional and only a
  // magic-link provider reaches the two methods that use it. The providers below
  // are OAuth and credentials, so it would name a table nothing ever queries.
  adapter: DrizzleAdapter(db, {
    usersTable: authAdapterUsers,
    accountsTable: authAdapterAccounts,
    sessionsTable: authAdapterSessions,
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
      // Replaces the stock reader so the address arrives with GitHub's own
      // verdict on whether it is confirmed. The default scope already asks for
      // `user:email`, so this needs no extra permission.
      userinfo: {
        url: `${GITHUB_API}/user`,
        async request(context: { tokens: { access_token?: string } }) {
          const accessToken = context.tokens.access_token;
          if (!accessToken) return {};
          return githubProfileWithVerification(accessToken);
        },
      },
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
  events: {
    /**
     * Record that a provider vouched for this address.
     *
     * Without this, `email_verified_at` is null for every account that signed
     * in with Google or GitHub, because Auth.js writes null on creation and
     * nothing ever revisits it. Those people would be asked to confirm an
     * address their provider had already confirmed, and the link would go to an
     * account that has no password to sign back in with.
     *
     * On every sign-in rather than only on the first. Both providers link to an
     * existing account by address, and in that case no user is created, so a
     * creation-only hook would miss the very case worth catching: someone who
     * registered with a password and later proved the same address through a
     * provider.
     *
     * Guarded on the column being null, so a confirmation that already happened
     * keeps its original timestamp. That column records when an address was
     * first proved, once.
     *
     * Failures are swallowed deliberately. This is bookkeeping beside a sign-in
     * that has already succeeded, and a database hiccup here must not turn into
     * a person unable to get in.
     */
    async signIn({ user, account, profile }) {
      if (!user.id || !account) return;
      if (account.type !== 'oauth' && account.type !== 'oidc') return;
      if (profile?.email_verified !== true) return;

      try {
        await db
          .update(users)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(users.id, user.id), isNull(users.emailVerifiedAt)));
      } catch (cause) {
        console.error('Could not record provider email verification', cause);
      }
    },
  },
});
