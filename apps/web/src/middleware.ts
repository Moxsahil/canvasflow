import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';
import { safeRedirect } from '@/lib/safe-redirect';

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ['/', '/login', '/signup', '/verify'];

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some(
    (path) => req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith('/api/auth'),
  );

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL('/login', req.nextUrl);
    // Validate the path before using it as a redirect target.
    // Without this, the middleware would forward any malicious 'next'
    // value, defeating the safeRedirect protection on the login page
    const safeNext = safeRedirect(req.nextUrl.pathname, '/boards');
    loginUrl.searchParams.set('next', safeNext);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
