import { sql } from 'drizzle-orm';
import { createClient, users } from '@canvasflow/db';
import { env } from '@/lib/env';

export interface LiveMetrics {
  /** Whether the API gateway answered its health check just now. */
  apiUp: boolean;
  /** Whether the sync server answered, and what it reported. */
  syncUp: boolean;
  /** Open WebSocket connections on the sync server right now. */
  connections: number | null;
  /** Boards loaded on the sync server right now: someone has each one open. */
  documents: number | null;
  /** Median time for the sync server to answer, from this web server, in ms. */
  syncMedianMs: number | null;
  /** Seconds the API has been running since its last restart, which is its last deploy. */
  apiUptimeSeconds: number | null;
}

const db = createClient(env.DATABASE_URL);

/**
 * Accounts made in the last 7 days. For the call to action's
 * line under its form; null if the database can't say.
 */
export async function getRecentSignups(): Promise<number | null> {
  try {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.createdAt} > now() - interval '7 days'`);
    return rows[0]?.n ?? null;
  } catch (err) {
    console.error('[live-metrics] could not count recent signups', err);
    return null;
  }
}

/** How many times the sync server is asked, for a median that isn't one lucky reply. */
const SYNC_SAMPLES = 5;

async function timed(url: string): Promise<{ ms: number; body: unknown } | null> {
  const started = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return { ms: performance.now() - started, body };
  } catch {
    return null;
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/**
 * What the stats section can say about the service right now, and only that.
 *
 * Every figure is read at render time from the services themselves: whether
 * each answers, the sync server's own count of open connections and loaded
 * boards, and how long it takes to answer this web server. Nothing here is
 * history — there is no uptime record to quote — so nothing here pretends to
 * be. The API's uptime is its process's own, so it counts from the last deploy
 * and is shown as that, never as an availability percentage. Each failure
 * turns into a null the section shows as unavailable.
 */
export async function getLiveMetrics(): Promise<LiveMetrics> {
  // Up is the plain health check; /healthz also asks the database, which can
  // be slow to wake, so it is read only for the uptime.
  const apiProbe = timed(`${env.NEXT_PUBLIC_API_URL}/health`);
  const apiDetail = timed(`${env.NEXT_PUBLIC_API_URL}/healthz`);

  const syncTimes: number[] = [];
  let lastBody: unknown = null;
  for (let i = 0; i < SYNC_SAMPLES; i++) {
    const result = await timed(`${env.SYNC_INTERNAL_URL}/health`);
    if (!result) continue;
    syncTimes.push(result.ms);
    lastBody = result.body;
  }

  const sync =
    lastBody && typeof lastBody === 'object'
      ? (lastBody as { connections?: unknown; documents?: unknown })
      : null;
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const api = await apiProbe;
  const detail = await apiDetail;
  const apiBody =
    detail?.body && typeof detail.body === 'object' ? (detail.body as { uptime?: unknown }) : null;

  return {
    apiUp: api !== null,
    apiUptimeSeconds: count(apiBody?.uptime),
    syncUp: syncTimes.length > 0,
    connections: count(sync?.connections),
    documents: count(sync?.documents),
    syncMedianMs: median(syncTimes),
  };
}
