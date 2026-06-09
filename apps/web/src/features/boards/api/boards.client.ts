import { env } from '@/lib/env';

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

export async function listBoards(): Promise<BoardDto[]> {
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}/boards`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch boards: ${response.status}`);
  }

  const json = (await response.json()) as ListBoardsResponse;
  return json.data;
}
