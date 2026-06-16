import type { NextAuthConfig } from 'next-auth';
import { env } from '@/lib/env';

// Edge-safe config — used directly by middleware (Edge Runtime).
// Must NOT import anything that touches Node-only APIs (pg/crypto via
// @canvasflow/db, bcrypt, etc.). DB-backed providers and the adapter are
// added on top of this in ./index, which only runs in the Node runtime.
export const authConfig: NextAuthConfig = {
  secret: env.AUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && typeof token.id === 'string') {
        session.user.id = token.id;
      }
      return session;
    },
  },
};
