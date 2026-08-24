import type { NextRequest } from 'next/server';
import { canEdit, createClient, updateBoardDetails, type BoardSummary } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';
import { corsJson, corsPreflight } from '@/lib/api/cors';

/**
 * The board's own record — its name and its tag colour.
 *
 * Called by the rename dialog in the editor's sidebar, cross-origin with the
 * user's session cookie, like the share and workspace routes beside it.
 *
 * Naming a board is an edit to it rather than an administrative act, so an
 * editor may do it and a viewer may not. That is a lower bar than sharing next
 * door on purpose: a title is document content, and a team that shares a board
 * shares the right to say what it is called.
 */

const db = createClient(env.DATABASE_URL);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BOARD_TITLE = 200;

const BOARD_COLORS: readonly BoardSummary['color'][] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'gray',
];

export async function OPTIONS() {
  return corsPreflight('PATCH');
}

/** Resolve the caller and confirm they may edit this board. */
async function authorize(boardId: string) {
  if (!UUID.test(boardId))
    return { error: corsJson({ error: 'Board not found' }, { status: 404 }) };

  const session = await auth();
  if (!session?.user?.id) {
    return { error: corsJson({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const access = await checkBoardAccess(session.user.id, boardId);
  // 404 rather than 403 for "exists but you may not": board ids must not be
  // probeable for existence.
  if (!access) return { error: corsJson({ error: 'Board not found' }, { status: 404 }) };

  if (!canEdit(access.role)) {
    return { error: corsJson({ error: 'Not allowed to rename this board' }, { status: 403 }) };
  }

  return { userId: session.user.id };
}

interface PatchBody {
  title?: unknown;
  color?: unknown;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await ctx.params;
  const authorized = await authorize(boardId);
  if ('error' in authorized) return authorized.error;

  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    // Falls through to the empty-patch answer below.
  }

  // Absent means "leave it alone"; present but unusable is a bad request
  // rather than something to silently drop, so a client bug is visible.
  const patch: { title?: string; color?: BoardSummary['color'] } = {};

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return corsJson({ error: 'A board needs a name.' }, { status: 400 });
    patch.title = title.slice(0, MAX_BOARD_TITLE);
  }

  if (body.color !== undefined) {
    const color = BOARD_COLORS.find((candidate) => candidate === body.color);
    if (!color) return corsJson({ error: 'Unknown board colour.' }, { status: 400 });
    patch.color = color;
  }

  if (patch.title === undefined && patch.color === undefined) {
    return corsJson({ error: 'Nothing to update.' }, { status: 400 });
  }

  const board = await updateBoardDetails(db, boardId, patch);
  // Access resolved a moment ago, so a miss here means it was deleted in
  // between — the same answer as a board that was never there.
  if (!board) return corsJson({ error: 'Board not found' }, { status: 404 });

  return corsJson({ data: board });
}
