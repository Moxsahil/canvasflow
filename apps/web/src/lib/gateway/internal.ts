import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Telling the API gateway about something that happened here which somebody
 * may want an email about, since the gateway is the service that sends email.
 *
 * Ids only. The gateway reads every word of an email back from the database,
 * so this carries no authority beyond saying where to look; the credential
 * only proves the call came from this service.
 *
 * Must match `services/api-gateway/src/common/internal-caller.ts`: the header,
 * and the purpose string that keeps the value good for this one route.
 */
const INTERNAL_AUTH_HEADER = 'x-canvasflow-internal';
const NOTIFY_PURPOSE = 'canvasflow:internal:notify:v1';

/** Give up rather than hold a request open for a service that is not answering. */
const TIMEOUT_MS = 2_000;

export type GatewayNotice =
  | { event: 'board-joined'; boardId: string; userId: string }
  | { event: 'workspace-joined'; inviteId: string; workspaceId: string }
  | {
      event: 'board-access-changed';
      boardId: string;
      userId: string;
      actorId: string;
      change: 'role' | 'restored';
    };

/**
 * Never throws and never takes long: the gateway answers before it emails,
 * and an email that could not be asked for must not fail what already
 * happened — a join, an accepted invitation, a role change.
 */
export async function notifyGateway(notice: GatewayNotice): Promise<void> {
  try {
    const res = await fetch(new URL('/internal/notify', env.NEXT_PUBLIC_API_URL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [INTERNAL_AUTH_HEADER]: createHmac('sha256', env.AUTH_SECRET)
          .update(NOTIFY_PURPOSE)
          .digest('hex'),
      },
      body: JSON.stringify(notice),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`The gateway answered ${res.status} to a ${notice.event} notice`);
  } catch (error) {
    console.warn(`Could not tell the gateway about a ${notice.event}:`, error);
  }
}
