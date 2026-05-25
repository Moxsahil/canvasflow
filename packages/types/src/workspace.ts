import type { WorkspaceId, UserId, MembershipId, ISODateString } from './primitives.js';

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

export interface Workspace {
  id: WorkspaceId;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Membership {
  id: MembershipId;
  workspaceId: WorkspaceId;
  userId: UserId;
  role: WorkspaceRole;
  joinedAt: ISODateString;
}
