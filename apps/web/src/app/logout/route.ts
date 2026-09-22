import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { signOut } from '@/lib/auth';
import { clearGuestSession } from '@/lib/auth/guest-session';

/**
 * The one place a session ends, for both kinds of session this app issues.
 *
 * The editor is a separate origin that cannot clear the web app's cookies from
 * script, so signing out there submits a form here and the browser navigates
 * with it. A navigation rather than a fetch on purpose: the response is the
 * login page, the cookies are dropped by the origin that set them, and the tab
 * holding a board document, a socket and a presence channel is replaced
 * outright rather than being asked to let go of them.
 *
 * POST only, and the redirect is a 303, so the browser follows it with a GET
 * onto the login page instead of re-posting into it.
 */

/** Origins whose forms may end a session here: this app, and the editor. */
const ALLOWED_ORIGINS = [env.AUTH_URL, env.NEXT_PUBLIC_EDITOR_URL].map(
  (url) => new URL(url).origin,
);

export async function POST(request: NextRequest) {
  // Browsers send Origin on every POST, so a form on someone else's site is
  // refused here rather than being allowed to log people out at will. A
  // missing header is not a browser form and still has to present the cookie
  // it is destroying, so it passes.
  const origin = request.headers.get('origin');
  if (origin !== null && !ALLOWED_ORIGINS.includes(origin)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // All three, unconditionally: a browser can hold a gateway session, an
  // Auth.js session and a guest cookie at once — sign in on a machine that
  // joined a board by share link and it has several — and leaving any behind
  // leaves the person signed in.
  await clearGuestSession();
  await signOut({ redirect: false });

  const response = NextResponse.redirect(new URL('/login', env.AUTH_URL), 303);
  await endGatewaySession(request, response);
  return response;
}

/**
 * Ask the gateway to revoke its session, and pass its answer to the browser.
 *
 * The revocation is the point. Clearing cookies here would drop this browser's
 * copy of the credential while the session row stayed live, so anything that
 * had captured the refresh token could keep renewing from it.
 *
 * The gateway's own `Set-Cookie` headers are copied onto this redirect rather
 * than reconstructed. It owns the attributes those cookies were set with —
 * paths, and the parent domain in production — and a browser only drops a
 * cookie when every one of them matches. Rebuilding that list here would be a
 * second copy of the same facts, quietly wrong the first time either changed.
 *
 * Note which cookie actually arrives: `cf.refresh` is scoped to `/auth`, so it
 * is never sent to this route. The gateway identifies the session from the
 * access token's `sid` claim instead.
 *
 * A failure here is swallowed. The local session is already gone by this
 * point, and a gateway that cannot be reached must not leave somebody staring
 * at an error on a page that says they are still signed in.
 */
async function endGatewaySession(request: NextRequest, response: NextResponse): Promise<void> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return;

  try {
    const result = await fetch(`${env.NEXT_PUBLIC_API_URL}/auth/signout`, {
      method: 'POST',
      headers: { cookie },
      cache: 'no-store',
    });

    for (const value of result.headers.getSetCookie()) {
      response.headers.append('set-cookie', value);
    }
  } catch (cause) {
    console.error('Could not revoke the gateway session', cause);
  }
}
