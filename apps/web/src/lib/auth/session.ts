import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { createClient, users } from '@canvasflow/db';
import { env } from '@/lib/env';
import { ACCESS_COOKIE, readAccessToken } from './gateway-session';

const db = createClient(env.DATABASE_URL);

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Nested as `session.user.id` rather than a bare id, because that is the shape
 * every caller already reads. Flattening it would mean rewriting thirteen
 * authorization checks for no change in what they decide.
 */
export interface CurrentSession {
  user: { id: string };
}

/**
 * Who is signed in, according to the API gateway's session cookie.
 *
 * The gateway is the only thing in CanvasFlow that signs anybody in; this app
 * verifies the short-lived access token it issued and nothing else. No
 * database call and no network: the signature is the proof.
 *
 * A missing or expired token answers null here. Renewing it is the gateway's
 * job, and this app cannot do it — the refresh cookie never reaches it — so a
 * page load in that state is sent to the gateway's resume route by the
 * middleware instead.
 */
export async function currentSession(): Promise<CurrentSession | null> {
  const jar = await cookies();
  const session = await readAccessToken(jar.get(ACCESS_COOKIE)?.value);
  return session ? { user: { id: session.userId } } : null;
}

/**
 * The same answer, with the profile attached.
 *
 * Separate from `currentSession` because it costs a query: the access token
 * carries only the account id, on purpose — a token is a credential, not a
 * profile, and a name baked into one goes stale the moment somebody changes it.
 *
 * Only the callers that mint an editor token need this. Everything else wants
 * the id, and should not pay for a lookup to get it.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const session = await readAccessToken(jar.get(ACCESS_COOKIE)?.value);
  if (!session) return null;

  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  // A token signed for an account that no longer exists. Deleting somebody
  // does not reach into their browser, so this is ordinary rather than
  // suspicious, and it means the same thing as not being signed in.
  return row ?? null;
}
