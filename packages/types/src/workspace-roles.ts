/**
 * What each role in a workspace may do — the one table every service and the
 * editor read, so the button the editor shows and the route that decides
 * cannot disagree.
 *
 * A workspace has exactly one owner. Ownership moves only by being offered and
 * accepted, never by a role change, which is why no capability here makes
 * anyone an owner.
 */

/** A role somebody holds in a workspace. Guests on single boards hold none. */
export type MemberRole = 'owner' | 'admin' | 'member';

export type WorkspaceCapability =
  /** Open and make boards in it, and see who else is in it. */
  | 'use'
  /** Rename the workspace. */
  | 'rename'
  /** Invite people by email, send invitations again, take them back. */
  | 'invite'
  /** Change members and admins between the two, and remove them. */
  | 'manage-members'
  /** Offer the ownership to somebody else, or take the offer back. */
  | 'hand-over'
  /** Delete the workspace and every board in it. */
  | 'delete'
  /** Leave it. Not the owner, who must hand over first. */
  | 'leave';

const CAPABILITIES: Record<MemberRole, readonly WorkspaceCapability[]> = {
  owner: ['use', 'rename', 'invite', 'manage-members', 'hand-over', 'delete'],
  admin: ['use', 'rename', 'invite', 'manage-members', 'leave'],
  member: ['use', 'leave'],
};

export function can(role: MemberRole, capability: WorkspaceCapability): boolean {
  return CAPABILITIES[role].includes(capability);
}

/**
 * Whether `actor` may change or remove the person holding `target`, themselves
 * aside: those who manage members manage members and admins, and nobody
 * changes the owner, whose standing moves only by handing it over.
 */
export function canManageMember(actor: MemberRole, target: MemberRole): boolean {
  return can(actor, 'manage-members') && target !== 'owner';
}
