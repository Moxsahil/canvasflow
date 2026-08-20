import type { NextRequest } from 'next/server';
import { canManageMembers, createClient, revokeShareLink } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';
import { corsJson, corsPreflight } from '@/lib/api/cors';

/**
 * Revoke one share link.
 *
 * Takes effect immediately: nothing caches link validity, so the next
 * redemption attempt fails. People already granted access keep it — their
 * board_members row is a separate decision, removed with revokeBoardAccess.
 */

const db = createClient(env.DATABASE_URL);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return corsPreflight('DELETE');
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ boardId: string; linkId: string }> },
) {
  const { boardId, linkId } = await ctx.params;
  if (!UUID.test(boardId) || !UUID.test(linkId)) {
    return corsJson({ error: 'Not found' }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return corsJson({ error: 'Not authenticated' }, { status: 401 });
  }

  const access = await checkBoardAccess(session.user.id, boardId);
  if (!access) return corsJson({ error: 'Not found' }, { status: 404 });
  if (!canManageMembers(access.role)) {
    return corsJson({ error: 'Not allowed to manage this board' }, { status: 403 });
  }

  // revokeShareLink is scoped by boardId as well as linkId, so a caller
  // authorized for one board cannot revoke another board's link by id.
  const revoked = await revokeShareLink(db, linkId, boardId);
  if (!revoked) return corsJson({ error: 'Not found' }, { status: 404 });

  return corsJson({ ok: true });
}
