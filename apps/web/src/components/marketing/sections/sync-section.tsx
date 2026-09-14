import { RevealText } from '@/components/marketing/reveal-text';
import { SectionLabel } from '@/components/marketing/section-label';
import { getSyncStats } from '@/lib/marketing/sync-stats';

/** "3 minutes ago", "2 days ago" — enough precision for a heading, no more. */
function sinceLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const CARD = 'border border-white/[0.08] bg-white/[0.02] rounded-2xl';

/**
 * Everything with a number on it here is read from the database at render, so
 * the section is only ever as impressive as the product actually is. That is
 * the point of it: a board count that climbs on its own is worth more than a
 * round figure nobody can check, and there is nothing to go back and correct
 * later.
 *
 * It is a server component for the same reason — the figures are fetched where
 * the credentials already are, and the browser is handed the result rather than
 * an endpoint it could be pointed at.
 */
export async function SyncSection() {
  const stats = await getSyncStats();

  return (
    <section id="infra" className="py-32 px-6 md:px-12 lg:px-20 border-t border-white/[0.08]">
      <div className="max-w-6xl mx-auto">
        <SectionLabel dark>Sync</SectionLabel>

        <RevealText className="mt-5 text-4xl md:text-5xl font-light tracking-tight leading-[1.05]">
          {'In sync, \n everywhere you open it.'}
        </RevealText>

        <p className="mt-6 text-white/45 max-w-xl leading-relaxed">
          Every board is one shared document. An edit lands on the sync server, fans out to everyone
          already in the room, and is written down before anyone has to think about saving it.
        </p>

        {stats && (
          <>
            <div className="mt-16 grid lg:grid-cols-3 gap-4">
              <div className={`lg:col-span-2 p-8 lg:p-12 ${CARD}`}>
                <div className="flex items-baseline gap-3">
                  <span className="text-7xl lg:text-8xl font-light tracking-tight tabular-nums">
                    {stats.boards}
                  </span>
                  <span className="text-xl text-white/45">
                    {stats.boards === 1 ? 'board' : 'boards'}
                  </span>
                </div>
                <p className="mt-4 text-white/45 max-w-md leading-relaxed">
                  Kept in sync right now, each one reconstructable from the snapshot the sync layer
                  keeps of it.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div className={`p-8 ${CARD}`}>
                  <span className="text-4xl lg:text-5xl font-light tracking-tight tabular-nums">
                    {stats.people}
                  </span>
                  <span className="block text-sm text-white/45 mt-2">
                    {stats.people === 1 ? 'person on them' : 'people on them'}
                  </span>
                </div>
                <div className={`p-8 ${CARD}`}>
                  <span className="text-4xl lg:text-5xl font-light tracking-tight">
                    {stats.lastSyncedAt ? sinceLabel(stats.lastSyncedAt) : 'no writes yet'}
                  </span>
                  <span className="block text-sm text-white/45 mt-2">last write to a board</span>
                </div>
              </div>
            </div>

            {/* Where the reference put four regions. We run one deployment, so
                there are no regions to list; these are the parts the request
                actually reached on the way to rendering this. */}
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.subsystems.map((s) => (
                <div key={s.name} className={`p-6 ${CARD}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        s.status === 'operational' ? 'bg-emerald-400/80' : 'bg-white/20'
                      }`}
                    />
                    <span className="text-[11px] tracking-widest text-white/40 uppercase">
                      {s.status}
                    </span>
                  </div>
                  <span className="block text-sm">{s.name}</span>
                </div>
              ))}
            </div>

            <p className="mt-6 text-xs text-white/25">
              Counted from the database when this page was built, and re-counted periodically.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
