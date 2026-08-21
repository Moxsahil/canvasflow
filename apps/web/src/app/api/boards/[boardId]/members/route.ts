import type { NextRequest } from 'next/server';
import { canManageMembers, createClient, listBoardAccess } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';
import { corsJson, corsPreflight } from '@/lib/api/cors';

/**
 * Who currently has access to this board.
 *
 * Read by the share dialog so an owner can see the people a link let in — and
 * change or remove them — rather than only being able to turn the link off,
 * which does nothing about anyone already admitted.
 */

const db = createClient(env.DATABASE_URL);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return corsPreflight('GET');
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await ctx.params;
  if (!UUID.test(boardId)) return corsJson({ error: 'Board not found' }, { status: 404 });

  const session = await auth();
  if (!session?.user?.id) return corsJson({ error: 'Not authenticated' }, { status: 401 });

  const access = await checkBoardAccess(session.user.id, boardId);
  // 404 rather than 403 — board ids must not be probeable for existence.
  if (!access) return corsJson({ error: 'Board not found' }, { status: 404 });

  // Seeing the full membership list is an administrative view, not something
  // every collaborator needs.
  if (!canManageMembers(access.role)) {
    return corsJson({ error: 'Not allowed to manage this board' }, { status: 403 });
  }

  return corsJson({ data: await listBoardAccess(db, boardId) });
}
