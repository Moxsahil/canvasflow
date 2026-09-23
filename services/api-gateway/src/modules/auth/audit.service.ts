import { Injectable, Logger } from '@nestjs/common';
import type { AuditAction } from '@canvasflow/types';
import { auditLog } from '@canvasflow/db';
import { DatabaseService } from '../../infra/database/database.service.js';

/**
 * Who made a request, as far as the edge can tell.
 *
 * Both fields are written by whoever called and neither decides anything —
 * they are here so that a row is worth reading months later, not so that
 * anything can be authorised by them.
 */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface AuthEvent {
  action: AuditAction;
  /** The account this happened to, or null when there is no account. */
  actorId: string | null;
  targetType: 'session' | 'user';
  targetId: string;
  /**
   * Anything worth knowing that is not a credential.
   *
   * No tokens, no hashes, no addresses. A row that carried any of those would
   * make the audit trail the easiest thing in the system to steal.
   */
  metadata?: Record<string, unknown>;
  context?: RequestContext;
}

/**
 * Writes down that an authentication event happened.
 *
 * The last line of the plan's security requirements: audit authentication
 * events without storing secrets. Until now the only trace of a session
 * beginning or a stolen token being caught was a log line, which scrolls away
 * and cannot be queried when somebody asks what happened to their account.
 *
 * Deliberately separate from whether the action succeeds. A write here is
 * bookkeeping beside something that has already happened; a database hiccup
 * must never turn into a person unable to sign in, so failures are logged and
 * swallowed.
 *
 * Only successes are recorded. Failed sign-ins are counted already, in
 * `sign_in_failures`, and that table stores a digest precisely because the
 * addresses people type are often not their own — writing them in clear here
 * would undo it.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly database: DatabaseService) {}

  async record(event: AuthEvent): Promise<void> {
    try {
      await this.database.db.insert(auditLog).values({
        // Null: none of these happen inside a workspace.
        workspaceId: null,
        actorId: event.actorId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: event.metadata ?? {},
        ipAddress: event.context?.ip ?? null,
        // Truncated for the same reason the session row truncates it: this is
        // somebody else's string and there is no reason to keep a kilobyte.
        userAgent: event.context?.userAgent?.slice(0, 256) ?? null,
      });
    } catch (cause) {
      this.logger.error(`Could not record ${event.action}: ${String(cause)}`);
    }
  }
}
