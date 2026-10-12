import { Injectable } from '@nestjs/common';
import { SYNC_PURPOSE, SyncInternalService } from '../../infra/sync/sync-internal.service.js';

/**
 * Telling everyone in a workspace that it changed, so their open editors
 * re-read it — the gateway's side of what the web app already does.
 *
 * Advisory: it carries no data and no authority, only which workspace, and the
 * editors fetch what changed through routes that check who is asking. Never
 * awaited by the change itself and never thrown from, because the change has
 * already happened and an editor re-reads on focus anyway.
 */
@Injectable()
export class WorkspaceEventsService {
  constructor(private readonly sync: SyncInternalService) {}

  /** `alsoTell`: people to reach who are not members, such as somebody who has just joined. */
  changed(workspaceId: string, alsoTell: readonly string[] = []): void {
    this.sync.tell('/internal/workspace-changed', SYNC_PURPOSE.workspaceChanged, {
      workspaceId,
      userIds: alsoTell,
    });
  }

  /**
   * Have the sync-server re-check one person on these boards now, rather than
   * at its next sweep — what makes somebody removed from a workspace lose the
   * board in front of them within a second. Boards they do not have open cost
   * the sync-server a lookup and nothing else.
   */
  boardAccessChanged(boardIds: readonly string[], userId: string): void {
    for (const boardId of boardIds)
      this.sync.tell('/internal/board-access', SYNC_PURPOSE.boardAccess, { boardId, userId });
  }
}
