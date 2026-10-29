'use client';

import { useEffect, useId, useState, type RefObject } from 'react';

/** How often the API is pinged while the board is on screen. */
export const EVERY_MS = 2000;
/** How many round trips the window holds: the last minute. */
export const WINDOW = 30;

/** The nearest-rank percentile: the smallest sample at least p% of the window is at or under. */
export function percentile(samples: number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

/**
 * The API timed from this browser every two seconds while `target` is on
 * screen, the last minute of round trips kept. Pinging stops while it is
 * scrolled away or the tab is hidden, so a page left open costs the API
 * nothing.
 */
export function useApiLatency(apiUrl: string, target: RefObject<HTMLElement | null>) {
  const [samples, setSamples] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const tick = async () => {
      if (stopped || !visible || document.hidden) return;
      const t = performance.now();
      try {
        const res = await fetch(`${apiUrl}/health`, { cache: 'no-store', credentials: 'omit' });
        if (!res.ok) throw new Error(String(res.status));
        const ms = performance.now() - t;
        setFailed(false);
        setSamples((prev) => [...prev, ms].slice(-WINDOW));
      } catch {
        setFailed(true);
      }
      if (!stopped) timer = setTimeout(tick, EVERY_MS);
    };

    const resume = () => {
      clearTimeout(timer);
      if (visible && !document.hidden) void tick();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        resume();
      },
      { threshold: 0.2 },
    );
    if (target.current) observer.observe(target.current);
    document.addEventListener('visibilitychange', resume);

    // The first call pays for DNS and TLS; it is made and thrown away.
    void fetch(`${apiUrl}/health`, { cache: 'no-store', credentials: 'omit' }).catch(() => {});

    return () => {
      stopped = true;
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
    };
  }, [apiUrl, target]);

  return { samples, failed };
}

/**
 * The window drawn as a line over a soft fill, newest on the right, with the
 * p95 as a dashed rule across it. The scale is the window's own slowest
 * sample, rounded up, so a quiet minute still fills the chart.
 */
export function LatencyChart({
  samples,
  p95,
  height = 'h-36',
}: {
  samples: number[];
  p95: number | null;
  /** The chart's height, as a class; the bento's card draws it shorter. */
  height?: string;
}) {
  const fillId = useId();
  const W = 600;
  const H = 140;
  const top = Math.max(10, Math.ceil((Math.max(0, ...samples) * 1.25) / 10) * 10);
  const x = (i: number) => (i / (WINDOW - 1)) * W;
  const y = (ms: number) => H - (ms / top) * H;
  // Newest sample sits at the right edge, so a part-filled window grows in from the right.
  const offset = WINDOW - samples.length;
  const points = samples.map((ms, i) => `${x(i + offset).toFixed(1)},${y(ms).toFixed(1)}`);

  return (
    <div className="relative mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className={`${height} w-full overflow-visible`}
        role="img"
        aria-label={
          samples.length
            ? `API latency over the last ${samples.length} requests, p95 ${Math.round(p95 ?? 0)} ms`
            : 'Waiting for the first request'
        }
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="rgb(255 255 255 / 0.06)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {points.length > 1 && (
          <>
            <defs>
              <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#135dfc" stopOpacity="0.35" />
                <stop offset="1" stopColor="#135dfc" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon
              points={`${x(offset).toFixed(1)},${H} ${points.join(' ')} ${W},${H}`}
              fill={`url(#${fillId})`}
            />
            <polyline
              points={points.join(' ')}
              fill="none"
              stroke="#4d84fd"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {p95 !== null && samples.length > 1 && (
          <line
            x1="0"
            x2={W}
            y1={y(p95)}
            y2={y(p95)}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {p95 !== null && samples.length > 1 && (
        <span
          className="absolute left-0 -translate-y-full pb-0.5 font-[family-name:var(--font-geist-mono)] text-[10px] text-[#f59e0b]"
          style={{ top: `${(y(p95) / H) * 100}%` }}
        >
          p95 {Math.round(p95)} ms
        </span>
      )}
      <div className="mt-1 flex justify-between font-[family-name:var(--font-geist-mono)] text-[10px] text-[#71717a]">
        <span>60 s ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
