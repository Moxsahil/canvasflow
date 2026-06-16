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

/**
 * Server-side board fetcher. Reads the session, signs a JWT, sends to api-gateway.
 */
export async function listBoards(): Promise<BoardDto[]> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  const { SignJWT } = await import('jose');
  const secret = new TextEncoder().encode(env.AUTH_SECRET);
  const token = await new SignJWT({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);

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
