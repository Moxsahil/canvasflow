import { describe, expect, it } from 'vitest';
import { compareWorkspaceMembers, type WorkspaceRole } from './workspaces.js';

const member = (name: string, role: WorkspaceRole, joined: string) => ({
  name,
  role,
  joinedAt: new Date(joined),
});

describe('compareWorkspaceMembers', () => {
  it('puts the owner first, then admins, then members', () => {
    const list = [
      member('Mia', 'member', '2026-01-01'),
      member('Ada', 'admin', '2026-03-01'),
      member('Sam', 'owner', '2026-05-01'),
    ].sort(compareWorkspaceMembers);
    expect(list.map((m) => m.name)).toEqual(['Sam', 'Ada', 'Mia']);
  });

  it('orders people with the same role by when they joined, not by name', () => {
    const list = [
      member('Ada', 'member', '2026-04-01'),
      member('Zed', 'member', '2026-02-01'),
      member('Kim', 'member', '2026-03-01'),
    ].sort(compareWorkspaceMembers);
    expect(list.map((m) => m.name)).toEqual(['Zed', 'Kim', 'Ada']);
  });
});
