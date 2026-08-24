import type { NextRequest } from 'next/server';
import { createClient, createWorkspaceForUser, listWorkspacesForUser } from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { corsJson, corsPreflight } from '@/lib/api/cors';

/**
 * The workspaces the caller belongs to, and a way to add one.
 *
 * Read by the editor's board switcher, cross-origin with the user's session
 * cookie — the same arrangement as /api/editor-token and the share routes. The
 * editor's own token is scoped to a single board and says nothing about the
 * rest of the account, so the cookie is what answers "what else can I open".
 *
 * A guest admitted by share link has no session here and gets a 401. That is
 * the intended answer: they were let into one board, not into a workspace.
 */

const db = createClient(env.DATABASE_URL);

const MAX_WORKSPACE_NAME = 60;

export async function OPTIONS() {
  return corsPreflight('GET, POST');
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return corsJson({ error: 'Not authenticated' }, { status: 401 });
  }

  return corsJson({ data: await listWorkspacesForUser(db, session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return corsJson({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { name?: unknown } = {};
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    // Falls through to the empty-name rejection below.
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return corsJson({ error: 'A workspace needs a name.' }, { status: 400 });
  }

  const workspace = await createWorkspaceForUser(db, {
    userId: session.user.id,
    name: name.slice(0, MAX_WORKSPACE_NAME),
  });

  return corsJson({ data: workspace }, { status: 201 });
}
