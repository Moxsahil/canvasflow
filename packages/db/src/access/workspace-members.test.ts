import { describe, expect, it } from 'vitest';
import { isAssignableRole } from './workspace-members.js';
import { can, canManageMember } from './workspaces.js';

describe('can', () => {
  it('lets members use the workspace and leave it, and nothing more', () => {
    expect(can('member', 'use')).toBe(true);
    expect(can('member', 'leave')).toBe(true);
    for (const capability of [
      'rename',
      'invite',
      'manage-members',
      'hand-over',
      'delete',
    ] as const) {
      expect(can('member', capability)).toBe(false);
    }
  });

  it('lets admins run the people in it, but not hand it over or delete it', () => {
    expect(can('admin', 'rename')).toBe(true);
    expect(can('admin', 'invite')).toBe(true);
    expect(can('admin', 'manage-members')).toBe(true);
    expect(can('admin', 'leave')).toBe(true);
    expect(can('admin', 'hand-over')).toBe(false);
    expect(can('admin', 'delete')).toBe(false);
  });

  it('keeps the owner from leaving until they have handed it over', () => {
    expect(can('owner', 'delete')).toBe(true);
    expect(can('owner', 'hand-over')).toBe(true);
    expect(can('owner', 'leave')).toBe(false);
  });
});

describe('canManageMember', () => {
  it('lets owners and admins manage members and admins, never the owner', () => {
    expect(canManageMember('owner', 'admin')).toBe(true);
    expect(canManageMember('admin', 'admin')).toBe(true);
    expect(canManageMember('admin', 'member')).toBe(true);
    expect(canManageMember('admin', 'owner')).toBe(false);
    expect(canManageMember('member', 'member')).toBe(false);
  });
});

describe('isAssignableRole', () => {
  it('assigns member and admin, never owner', () => {
    expect(isAssignableRole('member')).toBe(true);
    expect(isAssignableRole('admin')).toBe(true);
    expect(isAssignableRole('owner')).toBe(false);
    expect(isAssignableRole(null)).toBe(false);
  });
});
