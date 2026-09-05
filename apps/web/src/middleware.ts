import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { safeRedirect } from '@/lib/safe-redirect';

const { auth } = NextAuth(authConfig);

// `/logout` is public because ending a session must not require one: the
// middleware answers an unauthenticated request with a redirect to /login,
// and a 307 on a POST re-posts into a page that only serves GET. The route
// destroys session state and grants nothing, so there is nothing to guard.
const PUBLIC_PATHS = ['/', '/login', '/logout', '/signup', '/verify'];

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
const EDITOR_API_PREFIXES = ['/api/editor-token', '/api/boards/', '/api/workspaces'];

export default auth((req) => {
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

  if (!req.auth) {
    const loginUrl = new URL('/login', req.nextUrl);
    // Validate the path before using it as a redirect target.
    // Without this, the middleware would forward any malicious 'next'
    // value, defeating the safeRedirect protection on the login page
    const safeNext = safeRedirect(req.nextUrl.pathname, '/open');
    loginUrl.searchParams.set('next', safeNext);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
