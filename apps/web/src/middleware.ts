import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { safeRedirect } from '@/lib/safe-redirect';
import { ACCESS_COOKIE, accessTokenState, resumeUrl } from '@/lib/auth/gateway-session';

const { auth } = NextAuth(authConfig);

// `/logout` is public because ending a session must not require one: the
// middleware answers an unauthenticated request with a redirect to /login,
// and a 307 on a POST re-posts into a page that only serves GET. The route
// destroys session state and grants nothing, so there is nothing to guard.
const PUBLIC_PATHS = ['/', '/login', '/logout', '/signup', '/verify-email'];

/**
 * Routes the editor calls cross-origin, which must answer for themselves.
 *
 * A CORS preflight (OPTIONS) never carries cookies, so the middleware always
 * sees these as unauthenticated. Redirecting one to /login makes the browser
 * fail the whole request — "Redirect is not allowed for a preflight request" —
 * before the real call is ever sent, so a signed-in user sees a bare
 * "Failed to fetch".
 *
 * Every route behind this prefix list runs `auth()` itself and answers 401 as
 * JSON with CORS headers, which fetch() can actually act on. Adding a route
 * here is therefore not a hole: it moves the check from the middleware into
 * the handler, it does not remove it.
 */
const EDITOR_API_PREFIXES = ['/api/editor-token', '/api/boards/', '/api/workspaces', '/api/me'];

export default auth(async (req) => {
  const isPublic =
    PUBLIC_PATHS.some(
      (path) => req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith('/api/auth'),
    ) ||
    // Share links must open for people who have no account at all — that is
    // the whole point of a guest invite. The page itself grants nothing; it
    // only reads the link, and every path off it re-validates the token.
    req.nextUrl.pathname.startsWith('/invite/');

  if (isPublic) return NextResponse.next();

  // See EDITOR_API_PREFIXES: these authenticate inside the route handler so a
  // cookieless preflight is answered rather than redirected.
  if (EDITOR_API_PREFIXES.some((prefix) => req.nextUrl.pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Two systems mean "signed in" while the migration runs. `req.auth` is the
  // Auth.js session; the cookie is the API gateway's. Somebody who has just
  // signed in through the gateway has no Auth.js session at all, so checking
  // only the first would redirect them straight back to the page they came
  // from — a sign-in that appears to do nothing.
  //
  // Verification only, no database call. This runs on the Edge in front of
  // every request, and the signature is what makes the token worth trusting.
  const tokenState = await accessTokenState(req.cookies.get(ACCESS_COOKIE)?.value);

  if (req.auth || tokenState === 'valid') return NextResponse.next();

  // Validate the path before using it as a redirect target. Without this the
  // middleware would forward any malicious 'next' value, defeating the
  // safeRedirect protection on the other end.
  const safeNext = safeRedirect(req.nextUrl.pathname, '/open');

  // A missing or expired access token usually has a live session behind it —
  // somebody coming back after the fifteen minutes an access token lasts. This
  // app cannot renew it, because the refresh cookie never reaches it, so the
  // browser goes to the gateway, which renews and sends it straight back here.
  // Nobody with a session they have been using sees a sign-in form.
  if (tokenState === 'absent' || tokenState === 'expired') {
    return NextResponse.redirect(resumeUrl(safeNext));
  }

  // A token that fails its signature will fail it again after any renewal, so
  // sending it to the gateway would bounce between the two forever. Sign-in is
  // the only way out of that.
  const loginUrl = new URL('/login', req.nextUrl);
  loginUrl.searchParams.set('next', safeNext);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  // The public/ assets are the home page's own images, video and icons, served
  // to people who are not signed in — that is who the page is for. Without them
  // here the matcher redirects every one of them to /login and the page renders
  // with nothing in it.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|images/|videos/|icon.svg|icon-light-32x32.png|icon-dark-32x32.png|apple-icon.png).*)',
  ],
};
