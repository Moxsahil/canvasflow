import { Injectable, Logger } from '@nestjs/common';
import {
  activityDay,
  digestRecipients,
  forgetDelivery,
  markDeliveryEmailed,
  pruneBoardActivity,
  recordDeliveries,
  weekOfBoardsFor,
} from '@canvasflow/db';
import { parseEnv } from '../../config/env.js';
import { DatabaseService } from '../../infra/database/database.service.js';
import { EmailService } from '../email/email.service.js';
import { weeklyDigestEmail } from '../email/templates.js';
import { unsubscribeLinks } from './unsubscribe-token.js';

/** The boards one digest lists; the rest are counted. */
export const DIGEST_BOARD_LIMIT = 10;

/** How many people are read at once. */
const PAGE = 100;

/** How long activity is kept: the digest's week, and room to run it late. */
const KEEP_ACTIVITY_DAYS = 35;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The editor's address when nothing configures one, in development. */
const DEV_EDITOR_URL = 'http://localhost:3002';

/** `2026-W42`: the ISO week a run belongs to, which is what makes a rerun send nothing twice. */
export function isoWeek(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  // Thursday decides the year an ISO week belongs to.
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((day.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface DigestSummary {
  week: string;
  /** People who want the digest and can be written to. */
  people: number;
  /** Of those, how many had a board somebody else changed — those who are, or would be, mailed. */
  withNews: number;
  /** Mailed this run. Zero on a dry run. */
  emailed: number;
  /** Already mailed this week, by an earlier run. */
  repeats: number;
  /** The provider would not take it. */
  failed: number;
}

/**
 * The weekly digest: to each person who wants it, the boards they can open
 * that somebody else changed in the last seven days.
 *
 * Started by a scheduled job on Mondays. Nobody with nothing to read is
 * written to. Each person's digest is recorded under the week before it is
 * sent, so running it again — by hand, after a failure — sends only what has
 * not gone. What is logged is counts, never a name or an address.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly env = parseEnv();
  private readonly editorUrl =
    this.env.EDITOR_URL ?? (this.env.NODE_ENV === 'production' ? this.env.WEB_URL : DEV_EDITOR_URL);
  private running = false;

  constructor(
    private readonly database: DatabaseService,
    private readonly email: EmailService,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  async run(options: { dryRun: boolean; now?: Date }): Promise<DigestSummary> {
    if (this.running) throw new Error('A digest run is already under way');
    this.running = true;
    try {
      return await this.send(options.dryRun, options.now ?? new Date());
    } finally {
      this.running = false;
    }
  }

  private async send(dryRun: boolean, now: Date): Promise<DigestSummary> {
    const db = this.database.db;
    const week = isoWeek(now);
    const since = activityDay(new Date(now.getTime() - 7 * DAY_MS));
    const summary: DigestSummary = {
      week,
      people: 0,
      withNews: 0,
      emailed: 0,
      repeats: 0,
      failed: 0,
    };

    let after: string | null = null;
    for (;;) {
      const page = await digestRecipients(db, { after, limit: PAGE });
      if (page.length === 0) break;
      after = page[page.length - 1]!.id;

      for (const person of page) {
        summary.people += 1;
        const boards = await weekOfBoardsFor(db, person.id, since);
        if (boards.length === 0) continue;
        summary.withNews += 1;
        if (dryRun) continue;

        const [recorded] = await recordDeliveries(db, [
          {
            recipientId: person.id,
            kind: 'weekly-digest',
            sourceId: week,
            actorId: null,
            account: true,
          },
        ]);
        if (!recorded) {
          summary.repeats += 1;
          continue;
        }

        const links = unsubscribeLinks(
          { webUrl: this.env.WEB_URL, apiUrl: this.env.API_PUBLIC_URL },
          this.env.AUTH_SECRET,
          person.id,
          'weeklyDigest',
        );
        const listed = boards.slice(0, DIGEST_BOARD_LIMIT);
        const sent = await this.email.sendNotification(
          { to: person.email, userId: person.id },
          weeklyDigestEmail({
            boards: listed.map((board) => ({
              title: board.title,
              url: new URL(`/boards/${board.boardId}`, this.editorUrl).toString(),
              people: board.people,
              lastDay: board.lastDay,
            })),
            more: boards.length - listed.length,
            openUrl: new URL('/open', this.env.WEB_URL).toString(),
            unsubscribeUrl: links.pageUrl,
          }),
          links.oneClickUrl,
          'Weekly digest',
        );
        if (sent) {
          await markDeliveryEmailed(db, recorded.id);
          summary.emailed += 1;
        } else {
          // Not sent, so not recorded: a run by hand later tries them again.
          await forgetDelivery(db, recorded.id);
          summary.failed += 1;
        }
      }
    }

    if (!dryRun) {
      await pruneBoardActivity(
        db,
        activityDay(new Date(now.getTime() - KEEP_ACTIVITY_DAYS * DAY_MS)),
      );
    }
    this.logger.log(`Weekly digest ${dryRun ? '(dry run) ' : ''}${JSON.stringify(summary)}`);
    return summary;
  }
}
