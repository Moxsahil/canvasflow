import type { NextRequest } from 'next/server';
import {
  canManageMembers,
  createClient,
  createShareLink,
  listShareLinks,
  type ShareRole,
} from '@canvasflow/db';
import { env } from '@/lib/env';
import { auth } from '@/lib/auth';
import { checkBoardAccess } from '@/lib/boards/access';
import { corsJson, corsPreflight } from '@/lib/api/cors';

/**
 * Share-link management for one board.
 *
 * Called by the editor's share dialog, cross-origin with the user's session
 * cookie — the same arrangement as /api/editor-token.
 *
 * Only someone who can manage the board may mint or list links. Sharing is an
 * administrative act: it hands out standing access to a document, so it is
 * deliberately not something every editor on the board can do on the owner's
 * behalf. Loosen by swapping canManageMembers for canEdit if that proves too
 * strict in practice.
 */

const db = createClient(env.DATABASE_URL);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS() {
  return corsPreflight('GET, POST');
}

/** Resolve the caller and confirm they may administer this board's sharing. */
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

  if (!canManageMembers(access.role)) {
    return { error: corsJson({ error: 'Not allowed to share this board' }, { status: 403 }) };
  }

  return { userId: session.user.id };
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await ctx.params;
  const authorized = await authorize(boardId);
  if ('error' in authorized) return authorized.error;

  return corsJson({ data: await listShareLinks(db, boardId) });
}

interface CreateBody {
  role?: unknown;
  allowGuests?: unknown;
  expiresInHours?: unknown;
  maxUses?: unknown;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await ctx.params;
  const authorized = await authorize(boardId);
  if ('error' in authorized) return authorized.error;

  let body: CreateBody = {};
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    // An empty body is a valid request for a default link.
  }

  // 'owner' is never grantable by link — a share must not be able to hand over
  // the board.
  const role: ShareRole = body.role === 'viewer' ? 'viewer' : 'editor';

  const expiresInHours =
    typeof body.expiresInHours === 'number' && Number.isFinite(body.expiresInHours)
      ? Math.min(Math.max(body.expiresInHours, 1), 24 * 365)
      : null;

  const maxUses =
    typeof body.maxUses === 'number' && Number.isFinite(body.maxUses)
      ? Math.min(Math.max(Math.trunc(body.maxUses), 1), 10_000)
      : null;

  const { link, token } = await createShareLink(db, {
    boardId,
    createdBy: authorized.userId,
    role,
    allowGuests: body.allowGuests !== false,
    expiresAt: expiresInHours ? new Date(Date.now() + expiresInHours * 3_600_000) : null,
    maxUses,
  });

  return corsJson(
    {
      id: link.id,
      role: link.role,
      allowGuests: link.allowGuests,
      expiresAt: link.expiresAt,
      maxUses: link.maxUses,
      // The only time the plaintext token exists outside the caller's browser.
      // It is stored as a hash, so this response cannot be reproduced later.
      url: `${env.AUTH_URL}/invite/${token}`,
    },
    { status: 201 },
  );
}
