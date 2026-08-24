import type { NextRequest } from 'next/server';
import { createBoardInWorkspace, createClient, listWorkspaceBoards } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { corsJson, corsPreflight } from '@/lib/api/cors';

/**
 * The boards in one workspace — the panel that opens beside a workspace in the
 * editor's board switcher — and the only place new boards are created.
 *
 * Membership is the whole check. Both handlers answer 404 for a workspace the
 * caller isn't in, exactly as they would for one that doesn't exist, so ids
 * can't be probed for existence.
 */

const db = createClient(env.DATABASE_URL);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BOARD_TITLE = 200;

export async function OPTIONS() {
  return corsPreflight('GET, POST');
}

/** Resolve the caller; the workspace itself is authorized by the db helpers. */
async function authorize(workspaceId: string) {
  if (!UUID.test(workspaceId)) {
    return { error: corsJson({ error: 'Workspace not found' }, { status: 404 }) };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: corsJson({ error: 'Not authenticated' }, { status: 401 }) };
  }

  return { userId: session.user.id };
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await ctx.params;
  const authorized = await authorize(workspaceId);
  if ('error' in authorized) return authorized.error;

  const data = await listWorkspaceBoards(db, authorized.userId, workspaceId);
  if (!data) return corsJson({ error: 'Workspace not found' }, { status: 404 });

  return corsJson({ data });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await ctx.params;
  const authorized = await authorize(workspaceId);
  if ('error' in authorized) return authorized.error;

  let body: { title?: unknown } = {};
  try {
    body = (await request.json()) as { title?: unknown };
  } catch {
    // An empty body is a valid request for an untitled board.
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_BOARD_TITLE) : '';

  const board = await createBoardInWorkspace(db, {
    userId: authorized.userId,
    workspaceId,
    title: title || undefined,
  });
  if (!board) return corsJson({ error: 'Workspace not found' }, { status: 404 });

  return corsJson({ data: board }, { status: 201 });
}
