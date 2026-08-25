import type { NextRequest } from 'next/server';
import {
  canManageMembers,
  createClient,
  revokeBoardAccess,
  setBoardMemberRole,
  type AssignableBoardRole,
} from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';
import { corsJson, corsPreflight } from '@/lib/api/cors';
import { notifyBoardAccessChanged } from '@/lib/sync/internal';

/**
 * Change or remove one person's access to a board.
 *
 * Both take effect on the person's live session rather than at their next
 * reconnect: the write below lands in the database, and the sync-server is
 * then told to look at that one person's open sockets straight away. It also
 * re-checks every socket on a short interval regardless, so the change still
 * arrives if this service cannot be reached — the push is what makes it
 * immediate, the sweep is what makes it certain.
 */

const db = createClient(env.DATABASE_URL);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return corsPreflight('PATCH, DELETE');
}

/** Resolve the caller and confirm they may administer this board's membership. */
async function authorize(boardId: string, userId: string) {
  if (!UUID.test(boardId) || !UUID.test(userId)) {
    return { error: corsJson({ error: 'Not found' }, { status: 404 }) };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: corsJson({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const access = await checkBoardAccess(session.user.id, boardId);
  if (!access) return { error: corsJson({ error: 'Not found' }, { status: 404 }) };

  if (!canManageMembers(access.role)) {
    return { error: corsJson({ error: 'Not allowed to manage this board' }, { status: 403 }) };
  }

  return { actorId: session.user.id };
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ boardId: string; userId: string }> },
) {
  const { boardId, userId } = await ctx.params;
  const authorized = await authorize(boardId, userId);
  if ('error' in authorized) return authorized.error;

  let body: { role?: unknown };
  try {
    body = (await request.json()) as { role?: unknown };
  } catch {
    return corsJson({ error: 'A role is required' }, { status: 400 });
  }

  // Only these two are assignable. Owner comes from creating the board and is
  // deliberately not something an API call can hand over.
  if (body.role !== 'editor' && body.role !== 'viewer') {
    return corsJson({ error: 'Role must be editor or viewer' }, { status: 400 });
  }
  const role: AssignableBoardRole = body.role;

  const outcome = await setBoardMemberRole(db, boardId, userId, role);
  if (!outcome.ok) {
    if (outcome.reason === 'cannot-change-owner') {
      return corsJson({ error: "The board owner's role cannot be changed" }, { status: 400 });
    }
    if (outcome.reason === 'not-a-member') {
      return corsJson({ error: 'That person is not on this board' }, { status: 404 });
    }
    return corsJson({ error: 'Board not found' }, { status: 404 });
  }

  await notifyBoardAccessChanged(boardId, userId);

  return corsJson({ ok: true, role: outcome.role });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ boardId: string; userId: string }> },
) {
  const { boardId, userId } = await ctx.params;
  const authorized = await authorize(boardId, userId);
  if ('error' in authorized) return authorized.error;

  // Writes a revoked row rather than deleting one: an explicit revocation
  // outranks the workspace-wide fallback, so deleting would silently hand
  // access straight back to anyone who is also a workspace member.
  const outcome = await revokeBoardAccess(db, boardId, userId, authorized.actorId);
  if (!outcome.ok) {
    if (outcome.reason === 'cannot-revoke-owner') {
      return corsJson({ error: 'The board owner cannot be removed' }, { status: 400 });
    }
    return corsJson({ error: 'Board not found' }, { status: 404 });
  }

  // Awaited, unlike a fire-and-forget would be: the caller's next act is to
  // re-read the member list, and answering before the removed person's socket
  // has been told would let the owner watch a list update while the person
  // they removed is still drawing. It cannot fail the request — see
  // notifyBoardAccessChanged — and gives up after two seconds.
  await notifyBoardAccessChanged(boardId, userId);

  return corsJson({ ok: true });
}
