import { Activity, Check, Users, X } from 'lucide-react';
import { clientEnv } from '@/lib/env.client';
import { getLiveMetrics } from '@/lib/marketing/live-metrics';
import { cn } from '@/lib/utils';
import { LatencyCard } from './latency-card';
import { SyncMap } from './sync-map';

/** The built-in packs, as badges on the library card's stacked sheets. */
const PACKS = [
  { badge: 'FLOW', colour: 'bg-emerald-600 shadow-emerald-900/25' },
  { badge: 'WIRE', colour: 'bg-blue-500 shadow-blue-900/25' },
  { badge: 'NOTE', colour: 'bg-amber-500 shadow-amber-900/25' },
] as const;

/** The card surface every cell in the bento shares. */
const card = 'rounded-none bg-[#111113] text-[#fafafa] shadow ring ring-white/7 shadow-black/6.5';

/**
 * The stats and the product as one bento. The wide card is live sync on a
 * world map — people in seven cities, the sync server in Singapore, an edit
 * flying between them. Beside
 * it, the API's latency timed in the visitor's browser and the uptime
 * guarantee; under the map, the shape library and workspaces.
 *
 * On the landing page under How it works.
 */
export async function StatsBento({ id, className }: { id?: string; className?: string }) {
  const metrics = await getLiveMetrics();

  return (
    <section
      id={id}
      className={cn(
        "@container overflow-x-clip bg-[#09090b] py-24 font-[family-name:var(--font-inter-ui)] text-[15px]/[1.5] antialiased [font-feature-settings:'cv05','cv10','cv11','ss01']",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-5xl px-6 xl:px-0">
        {/* The same ruled frame, corner crosses and all, as How it works above. */}
        <div className="relative border border-white/10 p-3">
          <Corner className="top-0 left-0 -translate-[calc(50%-0.5px)]" />
          <Corner className="top-0 right-0 translate-x-[calc(50%-0.5px)] -translate-y-[calc(50%-0.5px)]" />
          <Corner className="right-0 bottom-0 translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
          <Corner className="bottom-0 left-0 -translate-x-[calc(50%-0.5px)] translate-y-[calc(50%-0.5px)]" />
          <div className="grid gap-3 @2xl:grid-cols-2 @2xl:grid-rows-2 @4xl:grid-cols-3">
            <div className="grid grid-rows-[auto_1fr] gap-3 @xl:col-span-2 @2xl:row-span-2">
              <div className={cn(card, 'grid grid-rows-[auto_1fr] gap-8 overflow-hidden p-8 pb-0')}>
                <Header
                  title="Real-time sync, worldwide"
                  description="Every edit travels over a live connection to our sync server in Singapore, which passes it straight on to everyone else on the board."
                />
                <SyncMap />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div
                  className={cn(card, 'group grid grid-cols-[auto_1fr] gap-6 overflow-hidden p-8')}
                >
                  <div
                    aria-hidden="true"
                    className="h-20 overflow-hidden pr-3 *:origin-left *:scale-90 *:transition-transform *:duration-1000 *:group-hover:-translate-y-[225%]"
                  >
                    <div className="relative z-10 flex h-20 w-fit flex-col gap-6">
                      {PACKS.map((pack) => (
                        <Sheet key={pack.badge} badge={pack.badge} colour={pack.colour} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-[460] text-white">Shape library</h3>
                    <p className="mt-2 text-[#9f9fa9]">
                      35 built-in shapes, community libraries and your own
                    </p>
                  </div>
                </div>

                <div
                  className={cn(card, 'group grid grid-cols-[auto_1fr] gap-6 overflow-hidden p-8')}
                >
                  <div
                    aria-hidden="true"
                    className="relative aspect-3/4 w-16 rounded border border-white/5 bg-radial from-white/10 to-transparent"
                  >
                    {[
                      '-top-px -left-px rounded-tl border-t border-l',
                      '-top-px -right-px rounded-tr border-t border-r',
                      '-bottom-px -left-px rounded-bl border-b border-l',
                      '-right-px -bottom-px rounded-br border-r border-b',
                    ].map((corner) => (
                      <span
                        key={corner}
                        className={`absolute block size-2 border-[#fafafa] motion-safe:animate-[breathing_2.4s_ease-in-out_infinite] ${corner}`}
                      />
                    ))}
                    <Users className="absolute inset-0 m-auto size-6 text-[#9f9fa9]" />
                    <style>{`@keyframes breathing { 50% { opacity: .35 } }`}</style>
                  </div>
                  <div>
                    <h3 className="font-[460] text-white">Workspaces</h3>
                    <p className="mt-2 text-[#9f9fa9]">
                      One home per team, with owner, admin and member roles
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className={cn(card, 'grid grid-rows-[auto_1fr] gap-8 overflow-hidden p-8')}>
              <Header
                title="API latency"
                description="Requests from your browser to our API, timed as you read."
              />
              <LatencyCard apiUrl={clientEnv.NEXT_PUBLIC_API_URL} />
            </div>

            <div
              className={cn(card, 'grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr] gap-8 p-8')}
            >
              <Header title="99.9% uptime" description="Uptime guarantee for all our services." />
              <div className="flex flex-col justify-end">
                <div aria-hidden="true" className="relative min-w-xs pb-16">
                  <div className="absolute inset-x-6 top-5 translate-x-2">
                    <div className="absolute inset-0 opacity-50 blur-lg">
                      <div className="absolute inset-x-6 top-12 bottom-0 -translate-y-3 bg-linear-to-r/increasing from-pink-400 to-purple-400" />
                    </div>
                    <div className="relative rounded-xl bg-[#141416]/95 shadow-lg ring-1 shadow-black/6.5 ring-white/7.5 backdrop-blur">
                      <X className="absolute top-2 right-2 size-3" />
                      <span className="block p-3 text-xs text-[#9f9fa9]">
                        {metrics.apiUp && metrics.syncUp
                          ? 'All systems answering'
                          : 'Some systems not answering'}
                      </span>
                      <div className="flex justify-between border-t border-white/7 p-2">
                        <span className="flex h-6 items-center gap-1.5 rounded-md p-2 text-[#9f9fa9]">
                          <Activity className="size-3.5 opacity-75" />
                          <span className="text-xs">API · Sync</span>
                        </span>
                        <div className="relative flex size-6 rounded-md bg-[#135dfc] text-white shadow before:absolute before:inset-0 before:rounded-md before:border before:border-white/20">
                          <Check className="m-auto size-3.5 drop-shadow" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <div className="h-1 w-4/5 rounded-full bg-white/7" />
                      <div className="flex items-center gap-1">
                        <div className="h-1 w-2/5 rounded-full bg-white/7" />
                        <div className="h-1 w-1/5 rounded-full bg-[#135dfc]" />
                        <div className="h-1 w-1/5 rounded-full bg-white/7" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <div className="h-1 w-2/5 rounded-full bg-white/7" />
                        <div className="h-1 w-1/5 rounded-full bg-white/7" />
                      </div>
                      <div className="flex w-3/4 items-center gap-1">
                        <div className="h-1 w-1/5 rounded-full bg-white/7" />
                        <div className="h-1 w-4/5 rounded-full bg-white/7" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A small plus where two rules meet, fading out from its middle. */
function Corner({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute size-3 mask-radial-from-15% before:absolute before:inset-0 before:m-auto before:h-px before:bg-white/25 after:absolute after:inset-0 after:m-auto after:w-px after:bg-white/25 ${className}`}
    />
  );
}

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="mb-2 font-[460] text-white">{title}</h3>
      <p className="text-balance text-[#9f9fa9]">{description}</p>
    </div>
  );
}

/** A sheet in the library card's stack: a few ruled lines, and its pack's badge. */
function Sheet({ badge, colour }: { badge: string; colour: string }) {
  const line = 'h-0.5 rounded-full bg-white/10';
  return (
    <div className="relative">
      <div
        className={`absolute -right-3 bottom-2 z-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-lg after:absolute after:inset-0 after:rounded after:border after:border-white/15 ${colour}`}
      >
        {badge}
      </div>
      <div className="relative z-1 w-16 space-y-3 rounded-md rounded-tr-[15%] bg-[#141416] p-3 shadow-md ring-1 shadow-black/6.5 ring-white/7.5">
        <div className="space-y-1.5">
          <div className={`${line} w-full`} />
          <div className="flex gap-1">
            <div className={`${line} w-1/3`} />
            <div className={`${line} w-1/3`} />
            <div className={`${line} w-1/3`} />
          </div>
          <div className="flex gap-1">
            <div className={`${line} w-1/2`} />
            <div className={`${line} w-1/2`} />
          </div>
          <div className="flex gap-1">
            <div className={`${line} w-1/3`} />
            <div className={`${line} w-2/3`} />
            <div className={`${line} w-1/3`} />
          </div>
        </div>
        <div className="flex gap-1 pt-1">
          <div className="h-0.5 w-4 rounded-full bg-[#fafafa]" />
        </div>
      </div>
    </div>
  );
}
