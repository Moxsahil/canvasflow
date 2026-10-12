import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { parseEnv } from '../../config/env.js';

/**
 * Must match `services/sync-server/src/security/internal-auth.ts`, as the web
 * app's copy in `apps/web/src/lib/sync/internal.ts` does: the header, and the
 * purpose strings that keep each value good for its one route.
 */
const INTERNAL_AUTH_HEADER = 'x-canvasflow-internal';

export const SYNC_PURPOSE = {
  workspaceChanged: 'canvasflow:internal:workspace-changed:v1',
  boardAccess: 'canvasflow:internal:board-access:v1',
  accountChanged: 'canvasflow:internal:account-changed:v1',
} as const;

/** The sync-server's internal port when both run on one machine. */
const DEV_SYNC_INTERNAL_URL = 'http://localhost:4001';

/** Give up rather than hold a request open for a service that is not answering. */
const TIMEOUT_MS = 2_000;

/**
 * Calling the sync-server's internal routes, which tell open editors that
 * something changed.
 *
 * Every call is advisory: it carries no data and no authority, the editors
 * re-read through routes that check who is asking, and they re-read on focus
 * anyway. So nothing here throws, and callers do not wait on it — the change
 * has already happened.
 */
@Injectable()
export class SyncInternalService {
  private readonly logger = new Logger(SyncInternalService.name);
  private readonly env = parseEnv();
  private readonly baseUrl =
    this.env.SYNC_INTERNAL_URL ??
    (this.env.NODE_ENV === 'production' ? null : DEV_SYNC_INTERNAL_URL);
  private readonly tokens = new Map<string, string>();

  /** Send and forget. */
  tell(path: string, purpose: string, body: unknown): void {
    void this.post(path, purpose, body);
  }

  private token(purpose: string): string {
    let token = this.tokens.get(purpose);
    if (!token) {
      token = createHmac('sha256', this.env.AUTH_SECRET).update(purpose).digest('hex');
      this.tokens.set(purpose, token);
    }
    return token;
  }

  private async post(path: string, purpose: string, body: unknown): Promise<void> {
    if (!this.baseUrl) return;
    try {
      const res = await fetch(new URL(path, this.baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [INTERNAL_AUTH_HEADER]: this.token(purpose),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) this.logger.warn(`sync-server answered ${res.status} to ${path}`);
    } catch (error) {
      this.logger.warn(`Could not reach the sync-server's ${path}: ${String(error)}`);
    }
  }
}
