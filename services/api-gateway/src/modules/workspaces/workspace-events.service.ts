import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { parseEnv } from '../../config/env.js';

/**
 * Must match `services/sync-server/src/security/internal-auth.ts`, as the web
 * app's copy in `apps/web/src/lib/sync/internal.ts` does: the header, and the
 * purpose string that keeps this value good for this one route.
 */
const INTERNAL_AUTH_HEADER = 'x-canvasflow-internal';
const WORKSPACE_CHANGED_PURPOSE = 'canvasflow:internal:workspace-changed:v1';

/** The sync-server's internal port when both run on one machine. */
const DEV_SYNC_INTERNAL_URL = 'http://localhost:4001';

/** Give up rather than hold a request open for a service that is not answering. */
const TIMEOUT_MS = 2_000;

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
  private readonly logger = new Logger(WorkspaceEventsService.name);
  private readonly env = parseEnv();
  private readonly baseUrl =
    this.env.SYNC_INTERNAL_URL ??
    (this.env.NODE_ENV === 'production' ? null : DEV_SYNC_INTERNAL_URL);
  private readonly token = createHmac('sha256', this.env.AUTH_SECRET)
    .update(WORKSPACE_CHANGED_PURPOSE)
    .digest('hex');

  /** `alsoTell`: people to reach who are not members, such as somebody who has just joined. */
  changed(workspaceId: string, alsoTell: readonly string[] = []): void {
    void this.send(workspaceId, alsoTell);
  }

  private async send(workspaceId: string, alsoTell: readonly string[]): Promise<void> {
    if (!this.baseUrl) return;
    try {
      const res = await fetch(new URL('/internal/workspace-changed', this.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [INTERNAL_AUTH_HEADER]: this.token },
        body: JSON.stringify({ workspaceId, userIds: alsoTell }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.warn(`sync-server answered ${res.status} to a workspace change`);
    } catch (error) {
      this.logger.warn(`Could not tell the sync-server about a workspace change: ${String(error)}`);
    }
  }
}
