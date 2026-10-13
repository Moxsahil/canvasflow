import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  canEdit,
  emailedSince,
  getProfile,
  liveBoardTitle,
  markDeliveryEmailed,
  notificationRecipients,
  recordDeliveries,
  resolveBoardAccess,
  type NotificationRecipient,
} from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { SYNC_PURPOSE, SyncInternalService } from '../../infra/sync/sync-internal.service.js';
import { EmailService } from '../email/email.service.js';
import { unsubscribeLinks } from './unsubscribe-token.js';

/** A comment as the sync-server reads it off the open board. */
interface BoardComment {
  authorId: string;
  body: string;
  mentionIds: string[];
}

/**
 * How long to keep asking the board for a comment that is not on it yet. The
 * browser reports a comment the moment it writes it, and the write travels
 * over the board's socket while the report comes here — usually the write
 * wins, sometimes by a little less.
 */
const LOOKUP_WAITS_MS = [0, 300, 900, 2_000];

/** One mention email per person per board in this long, however many comments name them. */
export const MENTION_QUIET_MS = 5 * 60_000;

/** The editor's address when nothing configures one, in development. */
const DEV_EDITOR_URL = 'http://localhost:3002';

export interface MentionReport {
  /** People named who can see the board, not counting the author. */
  mentioned: number;
  /** Of those, how many were emailed just now. */
  emailed: number;
}

/**
 * Emailing the people a comment @mentions.
 *
 * The browser only says which comment; everything an email says is read from
 * the board itself, through the sync-server, and from the database: who wrote
 * it, what it says, whom it names. So an email can only quote what is really
 * on a board, by its real author, to people who can open that board.
 *
 * Each person is recorded once per comment before anything is sent, which is
 * what makes a second report of the same comment — a retry, an edit that
 * keeps them named — send nothing more. An edit that names somebody new tells
 * just them.
 */
@Injectable()
export class MentionsService {
  private readonly logger = new Logger(MentionsService.name);
  private readonly env = parseEnv();
  private readonly editorUrl =
    this.env.EDITOR_URL ?? (this.env.NODE_ENV === 'production' ? this.env.WEB_URL : DEV_EDITOR_URL);

  constructor(
    private readonly database: DatabaseService,
    private readonly sync: SyncInternalService,
    private readonly email: EmailService,
  ) {}

  async report(
    actorId: string,
    boardId: string,
    threadId: string,
    commentId: string,
    now: () => Date = () => new Date(),
  ): Promise<MentionReport> {
    const db = this.database.db;

    // Somebody who cannot comment here has nothing here to report. Said the
    // same way whether the board is missing or theirs to view only.
    const access = await resolveBoardAccess(db, actorId, boardId);
    if (!access || !canEdit(access.role)) throw new NotFoundException('Board not found');

    const comment = await this.lookUp(boardId, threadId, commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== actorId) {
      throw new ForbiddenException('Only the author of a comment can report its mentions.');
    }

    const named = comment.mentionIds.filter((id) => id !== actorId);
    const reachable = await this.whoCanSee(boardId, await notificationRecipients(db, named));
    if (reachable.length === 0) return { mentioned: 0, emailed: 0 };

    const recorded = await recordDeliveries(
      db,
      reachable.map((person) => ({
        recipientId: person.id,
        kind: 'comment-mention' as const,
        boardId,
        sourceId: commentId,
        actorId,
      })),
    );
    if (recorded.length === 0) return { mentioned: reachable.length, emailed: 0 };

    const [author, boardTitle] = await Promise.all([
      getProfile(db, actorId),
      liveBoardTitle(db, boardId),
    ]);
    if (!boardTitle) return { mentioned: reachable.length, emailed: 0 };

    const openUrl = new URL(`/boards/${boardId}`, this.editorUrl);
    openUrl.searchParams.set('comment', threadId);

    let emailed = 0;
    for (const { id: deliveryId, recipientId } of recorded) {
      const person = reachable.find((candidate) => candidate.id === recipientId)!;
      if (!(await this.shouldEmail(person, boardId, now()))) continue;

      const links = unsubscribeLinks(
        { webUrl: this.env.WEB_URL, apiUrl: this.env.API_PUBLIC_URL },
        this.env.AUTH_SECRET,
        person.id,
        'commentMentions',
      );
      const sent = await this.email.sendCommentMention(
        { to: person.email, userId: person.id },
        {
          authorName: author?.name ?? 'Someone',
          boardTitle,
          body: comment.body,
          openUrl: openUrl.toString(),
          unsubscribeUrl: links.pageUrl,
        },
        links.oneClickUrl,
      );
      if (sent) {
        await markDeliveryEmailed(db, deliveryId, now());
        emailed += 1;
      }
    }
    return { mentioned: reachable.length, emailed };
  }

  /** The comment off the open board, asked again for a moment if it has not arrived. */
  private async lookUp(
    boardId: string,
    threadId: string,
    commentId: string,
  ): Promise<BoardComment | null> {
    for (const wait of LOOKUP_WAITS_MS) {
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const answer = await this.sync.ask<{ comment: BoardComment | null }>(
        '/internal/comment-lookup',
        SYNC_PURPOSE.commentLookup,
        { boardId, threadId, commentId },
      );
      if (answer?.comment) return answer.comment;
    }
    this.logger.warn(`Comment ${commentId} on board ${boardId} was not found on the open board`);
    return null;
  }

  /** The people named who can open the board. A guest has no address and is left out. */
  private async whoCanSee(
    boardId: string,
    people: NotificationRecipient[],
  ): Promise<NotificationRecipient[]> {
    const checked = await Promise.all(
      people.map(async (person) =>
        !person.isGuest && (await resolveBoardAccess(this.database.db, person.id, boardId))
          ? person
          : null,
      ),
    );
    return checked.filter((person): person is NotificationRecipient => person !== null);
  }

  /**
   * Whether to write to them: they want these emails, at an address they
   * confirmed, on an account in use — and they have not just been written to
   * about this board, so a burst of comments is one email.
   */
  private async shouldEmail(
    person: NotificationRecipient,
    boardId: string,
    at: Date,
  ): Promise<boolean> {
    if (!person.settings.commentMentions) return false;
    if (!person.emailVerified || person.disabled || person.deletionScheduled) return false;
    const since = new Date(at.getTime() - MENTION_QUIET_MS);
    return !(await emailedSince(
      this.database.db,
      { recipientId: person.id, boardId, kind: 'comment-mention' },
      since,
    ));
  }
}
