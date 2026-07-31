import { env } from '@/lib/env';
import { auth } from '@/lib/auth';

export interface BoardDto {
  id: string;
  workspaceId: string;
  title: string;
  ownerId: string;
  visibility: 'private' | 'workspace' | 'public-link';
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ListBoardsResponse {
  data: BoardDto[];
}

interface BoardResponse {
  data: BoardDto;
}

/**
 * Signs a short-lived JWT for the current session so server-side code can call
 * the api-gateway on the user's behalf. Throws if there is no session.
 */
async function signApiToken(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  const { SignJWT } = await import('jose');
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  return new SignJWT({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

/**
 * Server-side board fetcher. Reads the session, signs a JWT, sends to api-gateway.
 */
export async function listBoards(): Promise<BoardDto[]> {
  const token = await signApiToken();

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/boards`, {
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch boards: ${response.status}`);
  }

  const json = (await response.json()) as ListBoardsResponse;
  return json.data;
}

/**
 * Creates an empty board in the user's default workspace.
 */
export async function createBoard(title?: string): Promise<BoardDto> {
  const token = await signApiToken();

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/boards`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(title ? { title } : {}),
  });

  if (!response.ok) {
    throw new Error(`Failed to create board: ${response.status}`);
  }

  const json = (await response.json()) as BoardResponse;
  return json.data;
}
