import { SignJWT } from 'jose';
import type { BoardAccess } from '@canvasflow/db';
import { env } from '@/lib/env';

/**
 * How long an editor token lives.
 *
 * Short on purpose: it is the window in which revoked access still works. The
 * editor re-mints silently before expiry, so users never see the boundary.
 */
export const TOKEN_TTL_SECONDS = 5 * 60;

export interface MintedToken {
  token: string;
  expiresAt: number;
  boardId: string;
}

export interface EditorIdentity {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Sign a board-scoped editor token.
 *
 * The `role` claim is the caller's role ON THE BOARD (owner/editor/viewer),
 * which is what the sync-server turns into a read-only connection. It is
 * re-derived from the database on every mint and re-checked on every socket
 * connect, so a token is never the source of truth for permission — only a
 * short-lived assertion of what was true a moment ago.
 */
export async function mintEditorToken(
  identity: EditorIdentity,
  access: BoardAccess,
): Promise<MintedToken> {
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;

  const token = await new SignJWT({
    id: identity.id,
    email: identity.email,
    name: identity.name,
    boardId: access.boardId,
    workspaceId: access.workspaceId,
    role: access.role,
    accessSource: access.source,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .setIssuedAt()
    .sign(secret);

  return { token, expiresAt, boardId: access.boardId };
}

/** Where to send someone once they hold a token for a board. */
export function editorUrlFor(boardId: string, token: string): string {
  // The token rides in the fragment so it never reaches a server log or a
  // Referer header, matching how the dashboard opens boards.
  return `${env.NEXT_PUBLIC_EDITOR_URL}/boards/${boardId}#token=${token}`;
}
