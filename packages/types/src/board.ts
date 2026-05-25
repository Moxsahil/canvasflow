import type { BoardId, WorkspaceId, UserId, BoardVersionId, ISODateString } from './primitives.js';

export type BoardVisibility = 'private' | 'workspace' | 'public-link';

export interface Board {
  id: BoardId;
  workspaceId: WorkspaceId;
  title: string;
  ownerId: UserId;
  visibility: BoardVisibility;
  thumbnailUrl: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt: ISODateString | null;
}

export interface BoardVersion {
  id: BoardVersionId;
  boardId: BoardId;
  authorId: UserId;
  label: string | null;
  createdAt: ISODateString;
  snapshotUrl: string;
  sizeBytes: number;
}
