import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth/config';

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ['/', '/login', '/signup', '/verify'];

export default auth((req) => {
  const isPublic = PUBLIC_PATHS.some(
    (path) => req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith('/api/auth'),
  );

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const loginUrl = new URL('/login', req.nextUrl);
    loginUrl.searchParams.set('next', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
