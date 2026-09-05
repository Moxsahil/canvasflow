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

  // Both, unconditionally: a browser can hold an account session and a guest
  // cookie at once — sign in on a machine that joined a board by share link
  // and it has both — and leaving either behind leaves the person signed in.
  await clearGuestSession();
  await signOut({ redirect: false });

  return NextResponse.redirect(new URL('/login', env.AUTH_URL), 303);
}
