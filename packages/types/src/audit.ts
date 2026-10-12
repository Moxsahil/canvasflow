import type { AuditEventId, UserId, WorkspaceId, ISODateString } from './primitives.js';

export type AuditAction =
  | 'workspace.created'
  | 'workspace.deleted'
  /** An email invitation to join the workspace was sent, or sent again. */
  | 'workspace.member.invited'
  /** An invitation nobody had answered was taken back. */
  | 'workspace.invite.revoked'
  /** Somebody joined the workspace by accepting an email invitation. */
  | 'workspace.member.joined'
  /** Somebody left the workspace of their own accord. */
  | 'workspace.member.left'
  /** The owner offered the ownership to another member. */
  | 'workspace.ownership.offered'
  /** An ownership offer was taken back by the owner or turned down by the person offered it. */
  | 'workspace.ownership.offer_withdrawn'
  /** The person offered the ownership accepted it; the previous owner became an admin. */
  | 'workspace.ownership.transferred'
  /** What a guest may do on the workspace's boards was changed from the workspace's member list. */
  | 'workspace.guest.role.changed'
  /** A guest was taken off every board of the workspace they were on. */
  | 'workspace.guest.removed'
  | 'workspace.member.role.changed'
  | 'workspace.member.removed'
  | 'board.created'
  | 'board.renamed'
  | 'board.deleted'
  | 'board.restored'
  | 'board.shared'
  | 'board.unshared'
  | 'board.exported'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.password.changed'
  /** A reset link was sent to an account that can use one. */
  | 'auth.password.reset_requested'
  /** A password was replaced by following a reset link. */
  | 'auth.password.reset'
  /**
   * A provider confirmed the address of an account nobody had confirmed. Its
   * password and unconfirmed provider links were removed and every session
   * ended, so whoever registered the address first cannot still get in.
   */
  | 'auth.account.claimed'
  /**
   * Somebody asked for their own account to be deleted. It was locked, the
   * boards it owns were hidden and every session ended; the data is erased once
   * the grace period is over.
   */
  | 'auth.account.deletion_requested'
  /**
   * The grace period ran out and the account was erased: its files, its boards
   * and everything that said who it was. Written by the scheduled purge, so it
   * names no actor; the target is the anonymized account row.
   */
  | 'auth.account.deleted'
  /**
   * A deletion was called off inside its grace period, by support at the
   * owner's request: the account unlocked and the boards the request hid came
   * back. Names no actor — support is not an account.
   */
  | 'auth.account.deletion_cancelled'
  /** Every session an account had, ended at once. */
  | 'auth.session.revoked'
  /** A refresh token was presented after it had already been spent. */
  | 'auth.session.reuse_detected';

export interface AuditEvent {
  id: AuditEventId;
  workspaceId: WorkspaceId;
  actorId: UserId | null;
  action: AuditAction;
  targetType: 'workspace' | 'board' | 'user' | 'membership' | 'invite';
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: ISODateString;
}
