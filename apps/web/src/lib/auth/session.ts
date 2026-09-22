import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { createClient, users } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { ACCESS_COOKIE, readAccessToken } from './gateway-session';

const db = createClient(env.DATABASE_URL);

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Shaped like an Auth.js session on purpose.
 *
 * Every caller already reads `session?.user?.id`, and keeping that shape means
 * moving them across is a changed import rather than thirteen rewritten
 * control flows — which is thirteen chances to get an authorization check
 * subtly wrong.
 */
export interface CurrentSession {
  user: { id: string };
}

/**
 * Who is signed in, from whichever system signed them in.
 *
 * Two are live at once during the migration: the API gateway's session cookie,
 * and the Auth.js session that predates it. The gateway is checked first
 * because it is the one being moved to, and because somebody who has just
 * signed in through it should not be answered by a stale cookie from the other.
 *
 * This is deliberately the only place that knows there are two. Every caller
 * asks the same question and gets the same answer, so removing Auth.js at
 * stage 13 is an edit here rather than an edit everywhere.
 */
export async function currentSession(): Promise<CurrentSession | null> {
  const jar = await cookies();
  const fromGateway = await readAccessToken(jar.get(ACCESS_COOKIE)?.value);
  if (fromGateway) return { user: { id: fromGateway.userId } };

  const session = await auth();
  return session?.user?.id ? { user: { id: session.user.id } } : null;
}

/**
 * The same answer, with the profile attached.
 *
 * Separate from `currentUserId` because it costs a query on the gateway path:
 * the access token carries only the account id, on purpose — a token is a
 * credential, not a profile, and a name baked into one goes stale the moment
 * somebody changes it.
 *
 * Only the two callers that mint an editor token need this. Everything else
 * wants the id, and should not pay for a lookup to get it.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const fromGateway = await readAccessToken(jar.get(ACCESS_COOKIE)?.value);

  if (fromGateway) {
    const [row] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, fromGateway.userId))
      .limit(1);

    // A token signed for an account that no longer exists. Deleting somebody
    // does not reach into their browser, so this is ordinary rather than
    // suspicious, and it means the same thing as not being signed in.
    return row ?? null;
  }

  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}
