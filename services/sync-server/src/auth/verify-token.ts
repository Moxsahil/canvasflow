import { jwtVerify } from 'jose';
import { boardRoleEnum, type BoardRole } from '@canvasflow/db';

/**
 * The claims we expect in an editor token, minted by the web app's
 * /api/editor-token endpoint (and by the share-link join flow).
 *
 * See apps/web/src/lib/auth/editor-token.ts for the source of truth.
 */
export interface EditorTokenPayload {
  userId: string;
  email: string;
  name: string;
  boardId: string;
  workspaceId: string;
  /**
   * The caller's role ON THE BOARD.
   *
   * Imported from @canvasflow/db rather than restated as a literal union, so
   * the mint side and this check cannot drift. They did once: the claim was
   * changed from workspace roles (owner/admin/member) to board roles
   * (owner/editor/viewer) and this validation was left behind, which rejected
   * every token except an owner's. Every share link led to a blank canvas and
   * an endless token-refresh loop, because the socket could never authenticate.
   *
   * Informational only. The connection's actual permissions are resolved
   * against the database on every connect — see index.ts.
   */
  role: BoardRole;
}

/**
 * Read off the database enum rather than restated by hand, so this check
 * cannot fall out of step with the roles the system actually issues.
 */
const BOARD_ROLES: readonly string[] = boardRoleEnum.enumValues;

/**
 * Verify a JWT and extract the editor token payload.
 * Throws with a clear error message if the token is invalid or malformed.
 */
export async function verifyEditorToken(
  token: string,
  secret: string,
): Promise<EditorTokenPayload> {
  const secretKey = new TextEncoder().encode(secret);

  const { payload } = await jwtVerify(token, secretKey);

  // The web app uses `id` (not `sub`) for user ID
  if (typeof payload.id !== 'string') {
    throw new Error('Missing id claim in token');
  }
  if (typeof payload.boardId !== 'string') {
    throw new Error('Missing boardId claim in token');
  }
  if (typeof payload.workspaceId !== 'string') {
    throw new Error('Missing workspaceId claim in token');
  }
  if (typeof payload.role !== 'string' || !BOARD_ROLES.includes(payload.role)) {
    throw new Error(`Invalid role claim in token: ${String(payload.role)}`);
  }

  return {
    userId: payload.id,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    boardId: payload.boardId,
    workspaceId: payload.workspaceId,
    role: payload.role as BoardRole,
  };
}
