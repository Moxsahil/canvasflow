import { type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { createClient, users } from '@canvasflow/db';
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
  // A guest joined by share link and has no NextAuth session, only the guest
  // cookie issued at redemption. They still need re-mints — without this their
  // board silently stops syncing when the first token lapses. Access is
  // resolved from the database either way, so this identifies the caller and
  // authorizes nothing.
  const session = await auth();
  const sessionUser = session?.user;

  const identity: EditorIdentity | null = sessionUser?.id
    ? {
        id: sessionUser.id,
        email: sessionUser.email ?? null,
        name: sessionUser.name ?? null,
        isGuest: false,
      }
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

/**
 * Look the guest up rather than trusting the cookie for anything but the id.
 *
 * The `isGuest` check matters: it stops a stale or forged guest cookie from
 * ever resolving to a real account, even if it named one.
 */
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
