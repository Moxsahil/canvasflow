import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  INTERNAL_AUTH_HEADER,
  INTERNAL_PURPOSE,
  isInternalCaller,
} from '../../common/internal-caller.js';
import { parseEnv } from '../../config/env.js';
import { syncSeatsLater } from '../billing/seat-sync.js';
import { NotifyService } from './notify.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the web app reports. Ids only: every word of an email is read back here. */
export type NotifyEvent =
  | { event: 'board-joined'; boardId: string; userId: string }
  /** `workspaceId` lets a Team plan add the joiner's seat; the count is read here, not trusted. */
  | { event: 'workspace-joined'; inviteId: string; workspaceId: string | null }
  | {
      event: 'board-access-changed';
      boardId: string;
      userId: string;
      actorId: string;
      change: 'role' | 'restored';
    };

export function parseNotifyEvent(body: unknown): NotifyEvent | null {
  const input = (body ?? {}) as Record<string, unknown>;
  const id = (key: string) =>
    typeof input[key] === 'string' && UUID.test(input[key]) ? input[key] : null;
  switch (input.event) {
    case 'board-joined': {
      const [boardId, userId] = [id('boardId'), id('userId')];
      return boardId && userId ? { event: 'board-joined', boardId, userId } : null;
    }
    case 'workspace-joined': {
      const inviteId = id('inviteId');
      return inviteId
        ? { event: 'workspace-joined', inviteId, workspaceId: id('workspaceId') }
        : null;
    }
    case 'board-access-changed': {
      const [boardId, userId, actorId] = [id('boardId'), id('userId'), id('actorId')];
      const change = input.change === 'role' || input.change === 'restored' ? input.change : null;
      return boardId && userId && actorId && change
        ? { event: 'board-access-changed', boardId, userId, actorId, change }
        : null;
    }
    default:
      return null;
  }
}

/**
 * Where the web app reports what happened there that somebody may want an
 * email about — a share link used, an invitation accepted, someone's access to
 * a board changed — since this is the service that sends email.
 *
 * Answers at once and emails behind the answer: the web app's request must
 * not wait on a mail provider. Nothing it sends is trusted beyond the ids;
 * see NotifyService.
 */
@Controller('internal/notify')
export class InternalNotifyController {
  private readonly logger = new Logger(InternalNotifyController.name);
  private readonly env = parseEnv();

  constructor(
    private readonly notify: NotifyService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Post()
  @HttpCode(202)
  accept(@Headers(INTERNAL_AUTH_HEADER) credential: unknown, @Body() body: unknown): { ok: true } {
    if (!isInternalCaller(credential, this.env.AUTH_SECRET, INTERNAL_PURPOSE.notify)) {
      throw new UnauthorizedException('Not authorized');
    }
    const event = parseNotifyEvent(body);
    if (!event) throw new BadRequestException('Unknown or incomplete event');

    void this.handle(event).catch((error: unknown) =>
      this.logger.error(`Notifying about ${event.event} failed`, error),
    );
    return { ok: true };
  }

  private handle(event: NotifyEvent) {
    switch (event.event) {
      case 'board-joined':
        return this.notify.boardJoined(event.boardId, event.userId);
      case 'workspace-joined':
        if (event.workspaceId) syncSeatsLater(this.moduleRef, event.workspaceId);
        return this.notify.workspaceJoined(event.inviteId);
      case 'board-access-changed':
        return this.notify.boardAccessChanged(
          event.boardId,
          event.userId,
          event.actorId,
          event.change,
        );
    }
  }
}
