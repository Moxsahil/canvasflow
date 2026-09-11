import { type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient, getProfile, users } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';
import { mintEditorToken, type EditorIdentity } from '@/lib/auth/editor-token';
import { readGuestSession } from '@/lib/auth/guest-session';
import { corsJson, corsPreflight } from '@/lib/api/cors';

const db = createClient(env.DATABASE_URL);

/**
 * Mints a short-lived, board-scoped JWT for the editor and sync-server.
 *
 * The token carries:
 *   - id: the authenticated user's ID
 *   - boardId: which specific board they're authorized for
 *   - workspaceId: the board's workspace (for downstream authz)
 *   - role: the user's role ON THIS BOARD (owner/editor/viewer), which decides
 *     whether the session may write. A board role, not a workspace one — a
 *     viewer invited by share link is not a workspace member at all.
 *   - accessSource: whether that came from ownership, an explicit share, or
 *     workspace membership
 *
 * TTL is five minutes; the editor silently refreshes as expiry approaches so
 * users never see an interruption. If access is revoked mid-session the next
 * refresh fails (checkBoardAccess returns null) and the existing token lapses
 * within the TTL — and the sync-server re-checks on every reconnect besides.
 */

export async function OPTIONS() {
  return corsPreflight('GET');
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const sessionUser = session?.user;

  const identity: EditorIdentity | null = sessionUser?.id
    ? await loadAccountIdentity(sessionUser.id)
    : await loadGuestIdentityFromCookie();

  if (!identity) {
    return corsJson({ error: 'Not authenticated' }, { status: 401 });
  }

  const boardId = request.nextUrl.searchParams.get('boardId');
  if (!boardId) {
    return corsJson({ error: 'boardId is required' }, { status: 400 });
  }

  // Basic UUID shape check — malformed inputs never touch the DB
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(boardId)) {
    return corsJson({ error: 'Board not found' }, { status: 404 });
  }

  const access = await checkBoardAccess(identity.id, boardId);
  if (!access) {
    // 404 for both "doesn't exist" and "no access" — never leak existence.
    // This is also where a revoked guest stops being able to refresh.
    return corsJson({ error: 'Board not found' }, { status: 404 });
  }

  return corsJson(await mintEditorToken(identity, access));
}

async function loadAccountIdentity(userId: string): Promise<EditorIdentity | null> {
  const profile = await getProfile(db, userId);
  if (!profile || profile.isGuest) return null;

  return { id: profile.id, email: profile.email, name: profile.name, isGuest: false };
}

async function loadGuestIdentityFromCookie(): Promise<EditorIdentity | null> {
  const guestId = await readGuestSession();
  if (!guestId) return null;

  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, guestId), eq(users.isGuest, true)))
    .limit(1);

  const guest = rows[0];
  return guest ? { id: guest.id, email: null, name: guest.name, isGuest: true } : null;
}
