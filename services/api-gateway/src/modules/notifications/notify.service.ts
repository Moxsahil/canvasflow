import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  boardJoinFacts,
  emailedSince,
  liveBoardTitle,
  liveWorkspaceName,
  markDeliveryEmailed,
  notificationRecipients,
  personName,
  recordDeliveries,
  resolveBoardAccess,
  workspaceJoinFacts,
  workspaceRoleOf,
  type NotificationDeliveryKind,
  type NotificationScope,
} from '@canvasflow/db';
import type { NotificationKind } from '@canvasflow/types';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { EmailService } from '../email/email.service.js';
import {
  boardAccessEmail,
  boardJoinedEmail,
  guestAccessEmail,
  workspaceJoinedEmail,
  workspaceRoleEmail,
  type RenderedEmail,
} from '../email/templates.js';
import { unsubscribeLinks } from './unsubscribe-token.js';

/** However many people join one board through links, its link's maker hears once in this long. */
export const JOIN_QUIET_MS = 15 * 60_000;

/** A run of changes to one person's access is one email in this long — the first. */
export const ACCESS_QUIET_MS = 10 * 60_000;

/** The editor's address when nothing configures one, in development. */
const DEV_EDITOR_URL = 'http://localhost:3002';

/** One thing to tell one person, and everything that decides whether an email goes. */
interface Notice {
  recipientId: string;
  kind: NotificationDeliveryKind;
  scope: NotificationScope;
  /** With the kind and scope, what makes this the same notice if it is reported twice. */
  sourceId: string;
  actorId: string | null;
  /** The switch in Settings that turns this email off. */
  setting: NotificationKind;
  /** Hold the email if one of this kind went to them here this recently. Zero never holds. */
  quietMs: number;
  /** What a delivery failure is logged as. Never the address. */
  description: string;
  render: (unsubscribeUrl: string) => RenderedEmail;
}

export type NoticeOutcome = 'emailed' | 'held' | 'repeat' | 'nobody';

/**
 * Emails about things that happened to somebody, or because of them: a link
 * they shared was used, an invitation they sent was accepted, their access
 * changed.
 *
 * Every event is read back from the database before anything is sent, so a
 * report can only ever say what is true, and is recorded once before it is
 * mailed, so a report that arrives twice sends once. Nothing here throws to
 * its caller: the event has already happened, and an email that could not go
 * must not undo it.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);
  private readonly env = parseEnv();
  private readonly editorUrl =
    this.env.EDITOR_URL ?? (this.env.NODE_ENV === 'production' ? this.env.WEB_URL : DEV_EDITOR_URL);

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService,
  ) {}

  /** Somebody new came onto a board through a share link: tell whoever made the link. */
  async boardJoined(boardId: string, joinerId: string): Promise<NoticeOutcome> {
    const facts = await boardJoinFacts(this.database.db, boardId, joinerId);
    if (!facts || facts.grantedBy === joinerId) return 'nobody';

    return this.notify({
      recipientId: facts.grantedBy,
      kind: 'board-joined',
      scope: { boardId },
      sourceId: joinerId,
      actorId: joinerId,
      setting: 'inviteAccepted',
      quietMs: JOIN_QUIET_MS,
      description: 'Board joined email',
      render: (unsubscribeUrl) =>
        boardJoinedEmail({
          joinerName: facts.joinerName,
          joinerIsGuest: facts.joinerIsGuest,
          boardTitle: facts.boardTitle,
          role: facts.role,
          openUrl: this.boardUrl(boardId),
          unsubscribeUrl,
        }),
    });
  }

  /** A workspace invitation was accepted: tell whoever sent it. */
  async workspaceJoined(inviteId: string): Promise<NoticeOutcome> {
    const facts = await workspaceJoinFacts(this.database.db, inviteId);
    if (!facts || facts.invitedBy === facts.joinerId) return 'nobody';

    return this.notify({
      recipientId: facts.invitedBy,
      kind: 'workspace-joined',
      scope: { workspaceId: facts.workspaceId },
      sourceId: inviteId,
      actorId: facts.joinerId,
      setting: 'inviteAccepted',
      quietMs: 0,
      description: 'Workspace joined email',
      render: (unsubscribeUrl) =>
        workspaceJoinedEmail({
          joinerName: facts.joinerName,
          workspaceName: facts.workspaceName,
          role: facts.role,
          openUrl: this.openUrl(),
          unsubscribeUrl,
        }),
    });
  }

  /**
   * Somebody's role on a board changed, or they were let back on. Read back as
   * it stands now, so the email says what they can do at the moment it goes.
   */
  async boardAccessChanged(
    boardId: string,
    userId: string,
    actorId: string,
    change: 'role' | 'restored',
  ): Promise<NoticeOutcome> {
    if (userId === actorId) return 'nobody';
    const db = this.database.db;
    const [access, boardTitle, actorName] = await Promise.all([
      resolveBoardAccess(db, userId, boardId),
      liveBoardTitle(db, boardId),
      personName(db, actorId),
    ]);
    if (!access || access.role === 'owner' || !boardTitle) return 'nobody';

    return this.notify({
      recipientId: userId,
      kind: 'access-changed',
      scope: { boardId },
      sourceId: randomUUID(),
      actorId,
      setting: 'accessChanges',
      quietMs: ACCESS_QUIET_MS,
      description: 'Board access email',
      render: (unsubscribeUrl) =>
        boardAccessEmail({
          actorName: actorName ?? 'Someone',
          boardTitle,
          role: access.role,
          change,
          openUrl: this.boardUrl(boardId),
          unsubscribeUrl,
        }),
    });
  }

  /** A member was made an admin, or an admin a member. */
  async workspaceRoleChanged(
    workspaceId: string,
    userId: string,
    actorId: string,
  ): Promise<NoticeOutcome> {
    if (userId === actorId) return 'nobody';
    const db = this.database.db;
    const [role, workspaceName, actorName] = await Promise.all([
      workspaceRoleOf(db, userId, workspaceId),
      liveWorkspaceName(db, workspaceId),
      personName(db, actorId),
    ]);
    if (!role || role === 'owner' || !workspaceName) return 'nobody';

    return this.notify({
      recipientId: userId,
      kind: 'access-changed',
      scope: { workspaceId },
      sourceId: randomUUID(),
      actorId,
      setting: 'accessChanges',
      quietMs: ACCESS_QUIET_MS,
      description: 'Workspace role email',
      render: (unsubscribeUrl) =>
        workspaceRoleEmail({
          actorName: actorName ?? 'Someone',
          workspaceName,
          role,
          openUrl: this.openUrl(),
          unsubscribeUrl,
        }),
    });
  }

  /** A guest's access to the workspace's boards they are on was changed, all at once. */
  async guestAccessChanged(
    workspaceId: string,
    userId: string,
    actorId: string,
    role: string,
    boards: number,
  ): Promise<NoticeOutcome> {
    if (userId === actorId || boards === 0) return 'nobody';
    const db = this.database.db;
    const [workspaceName, actorName] = await Promise.all([
      liveWorkspaceName(db, workspaceId),
      personName(db, actorId),
    ]);
    if (!workspaceName) return 'nobody';

    return this.notify({
      recipientId: userId,
      kind: 'access-changed',
      scope: { workspaceId },
      sourceId: randomUUID(),
      actorId,
      setting: 'accessChanges',
      quietMs: ACCESS_QUIET_MS,
      description: 'Guest access email',
      render: (unsubscribeUrl) =>
        guestAccessEmail({
          actorName: actorName ?? 'Someone',
          workspaceName,
          role,
          boards,
          openUrl: this.openUrl(),
          unsubscribeUrl,
        }),
    });
  }

  /**
   * Record the notice, then email it if they want these emails, at an address
   * they confirmed, on an account in use, and were not just sent one like it.
   */
  private async notify(notice: Notice): Promise<NoticeOutcome> {
    const db = this.database.db;
    try {
      const [person] = await notificationRecipients(db, [notice.recipientId]);
      // A guest has no address; there is nobody to record this for.
      if (!person || person.isGuest) return 'nobody';

      const [recorded] = await recordDeliveries(db, [
        {
          recipientId: person.id,
          kind: notice.kind,
          sourceId: notice.sourceId,
          actorId: notice.actorId,
          ...notice.scope,
        },
      ]);
      if (!recorded) return 'repeat';

      if (!person.settings[notice.setting]) return 'held';
      if (!person.emailVerified || person.disabled || person.deletionScheduled) return 'held';
      if (notice.quietMs > 0) {
        const since = new Date(Date.now() - notice.quietMs);
        const recent = await emailedSince(
          db,
          { recipientId: person.id, kind: notice.kind, ...notice.scope },
          since,
        );
        if (recent) return 'held';
      }

      const links = unsubscribeLinks(
        { webUrl: this.env.WEB_URL, apiUrl: this.env.API_PUBLIC_URL },
        this.env.AUTH_SECRET,
        person.id,
        notice.setting,
      );
      const sent = await this.email.sendNotification(
        { to: person.email, userId: person.id },
        notice.render(links.pageUrl),
        links.oneClickUrl,
        notice.description,
      );
      if (!sent) return 'held';
      await markDeliveryEmailed(db, recorded.id);
      return 'emailed';
    } catch (error) {
      this.logger.error(`${notice.description} for user ${notice.recipientId} failed`, error);
      return 'held';
    }
  }

  private boardUrl(boardId: string): string {
    return new URL(`/boards/${boardId}`, this.editorUrl).toString();
  }

  private openUrl(): string {
    return new URL('/open', this.env.WEB_URL).toString();
  }
}
