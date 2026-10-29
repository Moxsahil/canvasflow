'use client';

import { useRef } from 'react';
import { percentile, useApiLatency } from './live-latency';

/** The round trip the bar measures against: a p50 at this fills it. */
const BUDGET_MS = 200;

/**
 * The foot of the bento's latency card: the API's round trip from this
 * browser, p50 on the right, p95 and p99 beside the label, and a bar for how
 * much of a 200 ms budget the p50 uses.
 */
export function LatencyCard({ apiUrl }: { apiUrl: string }) {
  const foot = useRef<HTMLDivElement>(null);
  const { samples, failed } = useApiLatency(apiUrl, foot);
  const ms = (value: number | null) => (value === null ? '—' : Math.max(1, Math.round(value)));
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const used = p50 === null ? 0 : Math.min(100, Math.max(4, (p50 / BUDGET_MS) * 100));

  return (
    <div
      ref={foot}
      className="-mx-8 -mb-8 flex flex-col justify-end border-t border-white/7 px-8 pt-4 pb-8 mask-r-from-55% mask-l-from-85%"
    >
      <div className="space-y-2.5">
        <span className="block text-sm font-medium">
          {failed ? 'Not reaching the API' : 'API round trip, live'}
        </span>
        <div className="flex justify-between text-sm" aria-live="polite">
          <span className="text-sm text-[#9f9fa9]">
            p95 {ms(p95)} ms / p99 {ms(percentile(samples, 99))} ms
          </span>
          <span>{ms(p50)} ms</span>
        </div>
        <div className="relative my-1.5 h-1.5 rounded-full bg-[#27272a]">
          <div
            className="absolute inset-y-0 left-0 z-1 rounded-full bg-linear-to-r from-white to-[#4d84fd] transition-[width] duration-500"
            style={{ width: `${used}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-white to-[#4d84fd] opacity-50 blur-xs transition-[width] duration-500"
            style={{ width: `${used}%` }}
          />
        </div>
      </div>
    </div>
  );
}
