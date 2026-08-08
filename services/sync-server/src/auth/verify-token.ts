import { jwtVerify } from 'jose';

/**
 * The claims we expect in an editor token, minted by the web app's
 * /api/editor-token endpoint. Shape must match SignJWT payload there.
 *
 * See apps/web/src/app/api/editor-token/route.ts for the source of truth.
 */
export interface EditorTokenPayload {
  userId: string;
  email: string;
  name: string;
  boardId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'member';
}

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
  if (payload.role !== 'owner' && payload.role !== 'admin' && payload.role !== 'member') {
    throw new Error('Invalid role claim in token');
  }

  return {
    userId: payload.id,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    boardId: payload.boardId,
    workspaceId: payload.workspaceId,
    role: payload.role,
  };
}
