import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';

/**
 * Mints a short-lived JWT for the editor.
 *
 * Session cookie authenticates the request. We issue a fresh JWT
 * (10-minute expiry) that the editor will use for its API calls.
 *
 * The editor picks the token up from the URL hash fragment on first
 * load, then calls this route again (cross-origin, with the session
 * cookie) to silently refresh the token as it nears expiry — so it
 * needs CORS enabled for the editor's origin, credentialed.
 */
const TOKEN_TTL_SECONDS = 10 * 60;

function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', env.NEXT_PUBLIC_EDITOR_URL);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Vary', 'Origin');
  return response;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return withCors(response);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return withCors(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
  }

  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  const token = await new SignJWT({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .setIssuedAt()
    .sign(secret);

  return withCors(NextResponse.json({ token, expiresAt }));
}
