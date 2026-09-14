import { sql } from 'drizzle-orm';
import { createClient, boards, users, boardShareLinks, boardUpdates } from '@canvasflow/db';
import { env } from '@/lib/env';

export type SubsystemStatus = 'operational' | 'offline';

export interface Subsystem {
  name: string;
  status: SubsystemStatus;
}

export interface SyncStats {
  boards: number;
  people: number;
  shareLinks: number;
  /** ISO timestamp of the newest row the sync layer has written, or null. */
  lastSyncedAt: string | null;
  subsystems: Subsystem[];
}

const db = createClient(env.DATABASE_URL);

/** A part counts as operational only if it answers in time, and answers 2xx. */
async function probe(name: string, url: string): Promise<Subsystem> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    return { name, status: res.ok ? 'operational' : 'offline' };
  } catch {
    return { name, status: 'offline' };
  }
}

/** Every figure the section shows, in one round trip. */
async function readCounts() {
  const rows = await db
    .select({
      boards: sql<number>`(select count(*)::int from ${boards})`,
      people: sql<number>`(select count(*)::int from ${users})`,
      shareLinks: sql<number>`(select count(*)::int from ${boardShareLinks})`,
      lastSyncedAt: sql<
        string | null
      >`(select max(${boardUpdates.createdAt})::text from ${boardUpdates})`,
    })
    .from(sql`(select 1) as one`);
  return rows[0] ?? null;
}

/**
 * What the section shows is whatever this returns, and this returns only what
 * the database and the services will confirm.
 *
 * The counts are every board on record, every account, every share link handed
 * out. `board_updates` is not an edit count and is not offered as one — the
 * sync layer prunes it to a short window of whole snapshots per board, so the
 * only honest reading is its newest timestamp, which says when sync last wrote.
 *
 * There is deliberately no uptime percentage and no latency figure. We run a
 * single deployment and keep no availability history, so neither number exists
 * to be quoted. The status row reports which parts answer right now instead,
 * which is a claim we can make good on.
 *
 * The retry is not belt and braces. The database autosuspends when idle and a
 * first query against a cold one can take seconds or fall over outright, which
 * is exactly the kind of thing that happens on the request that rebuilds this
 * page. Without the second attempt that one unlucky moment is enough to render
 * the section empty, and because the render is cached the emptiness outlives
 * the hiccup by a long way — so the cheap retry is what keeps a transient
 * failure from becoming a visible one.
 *
 * A failure still must not take the page down: this returns null and the
 * section drops its figures rather than throwing. That path is logged, because
 * a section that quietly renders blank and tells nobody why is worse than one
 * that breaks loudly.
 */
export async function getSyncStats(): Promise<SyncStats | null> {
  const probed = Promise.all([
    probe('API gateway', `${env.NEXT_PUBLIC_API_URL}/health`),
    probe('Sync server', `${env.SYNC_INTERNAL_URL}/health`),
  ]);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const row = await readCounts();
      if (!row) return null;

      return {
        boards: row.boards,
        people: row.people,
        shareLinks: row.shareLinks,
        lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : null,
        // The database answered or we would not have got here, and the web app
        // is what is rendering this, so those two are operational by construction.
        subsystems: [
          { name: 'Web', status: 'operational' },
          ...(await probed),
          { name: 'Database', status: 'operational' },
        ],
      };
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      console.error('[sync-stats] could not read counts; section will render without figures', err);
    }
  }

  return null;
}
