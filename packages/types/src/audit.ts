import type { AuditEventId, UserId, WorkspaceId, ISODateString } from './primitives.js';

export type AuditAction =
  | 'workspace.created'
  | 'workspace.deleted'
  | 'workspace.member.invited'
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
  /** Every session an account had, ended at once. */
  | 'auth.session.revoked'
  /** A refresh token was presented after it had already been spent. */
  | 'auth.session.reuse_detected';

export interface AuditEvent {
  id: AuditEventId;
  workspaceId: WorkspaceId;
  actorId: UserId | null;
  action: AuditAction;
  targetType: 'workspace' | 'board' | 'user' | 'membership';
  targetId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: ISODateString;
}
