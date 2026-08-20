import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

/**
 * Allow the editor to call this route cross-origin with cookies.
 *
 * The editor is a separate Vite app on its own origin, so every route it
 * needs — token refresh, share-link management — has to opt in explicitly.
 * The allowed origin is a single configured URL rather than a reflected
 * request header: reflecting `Origin` alongside
 * `Access-Control-Allow-Credentials` would let any site on the internet make
 * authenticated calls with the user's session cookie.
 */
export function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', env.NEXT_PUBLIC_EDITOR_URL);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Vary', 'Origin');
  return response;
}

/** Preflight response for a route, naming the methods it actually serves. */
export function corsPreflight(methods: string): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', `${methods}, OPTIONS`);
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return withCors(response);
}

/** A JSON body with the CORS headers already applied. */
export function corsJson(body: unknown, init?: { status?: number }): NextResponse {
  return withCors(NextResponse.json(body, init));
}
