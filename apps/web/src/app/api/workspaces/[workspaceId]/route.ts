import type { NextRequest } from 'next/server';
import {
  canDeleteWorkspace,
  canRenameWorkspace,
  createClient,
  deleteWorkspace,
  renameWorkspace,
  workspaceRoleOf,
} from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { corsJson, corsPreflight } from '@/lib/api/cors';

/**
 * The workspace's own record — renaming it, and deleting it outright.
 *
 * Called by the manage dialog in the editor's board switcher, cross-origin
 * with the user's session cookie, like the routes beside it.
 *
 * Unlike `/boards` next door, membership alone is not enough here: these are
 * administrative acts, so the caller's workspace role decides. A non-member
 * still gets 404 rather than 403, so workspace ids can't be probed for
 * existence — the distinction only appears once you are demonstrably inside.
 */

const db = createClient(env.DATABASE_URL);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_WORKSPACE_NAME = 60;

export async function OPTIONS() {
  return corsPreflight('PATCH, DELETE');
}

/** Resolve the caller and their standing in this workspace. */
async function authorize(workspaceId: string) {
  if (!UUID.test(workspaceId)) {
    return { error: corsJson({ error: 'Workspace not found' }, { status: 404 }) };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: corsJson({ error: 'Not authenticated' }, { status: 401 }) };
  }

  const role = await workspaceRoleOf(db, session.user.id, workspaceId);
  // Null covers "no such workspace", "already deleted" and "not yours". All
  // three answer the same way on purpose.
  if (!role) return { error: corsJson({ error: 'Workspace not found' }, { status: 404 }) };

  return { userId: session.user.id, role };
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await ctx.params;
  const authorized = await authorize(workspaceId);
  if ('error' in authorized) return authorized.error;

  if (!canRenameWorkspace(authorized.role)) {
    return corsJson(
      { error: 'Only an owner or admin can rename this workspace.' },
      { status: 403 },
    );
  }

  let body: { name?: unknown } = {};
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    // Falls through to the empty-name rejection below.
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return corsJson({ error: 'A workspace needs a name.' }, { status: 400 });

  const workspace = await renameWorkspace(
    db,
    workspaceId,
    name.slice(0, MAX_WORKSPACE_NAME),
    authorized.role,
  );
  // Authorized a moment ago, so a miss means it was deleted in between — the
  // same answer as one that was never there.
  if (!workspace) return corsJson({ error: 'Workspace not found' }, { status: 404 });

  return corsJson({ data: workspace });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await ctx.params;
  const authorized = await authorize(workspaceId);
  if ('error' in authorized) return authorized.error;

  if (!canDeleteWorkspace(authorized.role)) {
    return corsJson({ error: 'Only the owner can delete this workspace.' }, { status: 403 });
  }

  const result = await deleteWorkspace(db, workspaceId);
  if (!result) return corsJson({ error: 'Workspace not found' }, { status: 404 });

  return corsJson({ data: result });
}
