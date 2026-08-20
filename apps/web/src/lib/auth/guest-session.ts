import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';

/**
 * A lightweight session for people who joined a board through a share link
 * without an account.
 *
 * Guests need one for the same reason signed-in users do: editor tokens live
 * five minutes and are re-minted silently, and that re-mint has to prove who is
 * asking. A guest has no NextAuth session, so without this their board simply
 * stops syncing after five minutes while /api/editor-token answers 401 forever.
 *
 * Deliberately not a NextAuth session: a guest is not an account, must not
 * appear in sign-in flows, and should expire on its own. All this cookie
 * asserts is "you are guest user X" — it grants nothing. Every mint still
 * resolves board access against the database, so revoking a guest's grant locks
 * them out on the next refresh regardless of the cookie.
 */

const COOKIE_NAME = 'cf.guest';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface GuestClaims {
  guestId: string;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

/** Issue the cookie. Called once, when a guest redeems a share link. */
export async function setGuestSession(guestId: string): Promise<void> {
  const token = await new SignJWT({ guestId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS)
    .setIssuedAt()
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure in production only, so the http://localhost development setup
    // keeps working.
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

/** The guest this browser is, if any. Returns null for anything unverifiable. */
export async function readGuestSession(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const { guestId } = payload as unknown as GuestClaims;
    return typeof guestId === 'string' && guestId.length > 0 ? guestId : null;
  } catch {
    // Expired or tampered with — treat exactly like no cookie at all.
    return null;
  }
}
