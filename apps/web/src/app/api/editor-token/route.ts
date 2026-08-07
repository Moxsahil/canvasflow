import { NextResponse, type NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';

/**
 * Mints a short-lived, board-scoped JWT for the editor and sync-server.
 *
 * The token carries:
 *   - id: the authenticated user's ID
 *   - boardId: which specific board they're authorized for
 *   - workspaceId: the board's workspace (for downstream authz)
 *   - role: the user's role in that workspace (owner/admin/member)
 *
 * TTL: 5 minutes. Editor silently refreshes as expiry approaches so users
 * never experience an interruption. If a user's access is revoked mid-session,
 * their refresh will fail on the next attempt (checkBoardAccess returns null),
 * and their existing token expires naturally within 5 minutes.
 *
 * On revocation: existing token remains valid for up to 5 more minutes,
 * matching typical enterprise access-token revocation windows. Immediate
 * cutoff requires the sync-server's periodic re-authorization (PR #28).
 */

const TOKEN_TTL_SECONDS = 5 * 60;

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

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return withCors(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
  }

  const boardId = request.nextUrl.searchParams.get('boardId');
  if (!boardId) {
    return withCors(NextResponse.json({ error: 'boardId is required' }, { status: 400 }));
  }

  // Basic UUID shape check — malformed inputs never touch the DB
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boardId)) {
    return withCors(NextResponse.json({ error: 'Board not found' }, { status: 404 }));
  }

  const access = await checkBoardAccess(session.user.id, boardId);
  if (!access) {
    // 404 for both "doesn't exist" and "no access" — never leak existence
    return withCors(NextResponse.json({ error: 'Board not found' }, { status: 404 }));
  }

  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;

  const token = await new SignJWT({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    boardId: access.boardId,
    workspaceId: access.workspaceId,
    role: access.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .setIssuedAt()
    .sign(secret);

  return withCors(NextResponse.json({ token, expiresAt, boardId: access.boardId }));
}
