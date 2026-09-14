'use client';

import { useEffect, useState, useRef } from 'react';

const BOARD_NAMES = [
  'q3-roadmap',
  'onboarding-flow',
  'auth-redesign',
  'pricing-ideas',
  'sprint-42',
  'systems-map',
  'retro-april',
  'brand-refresh',
  'mobile-nav-v2',
  'data-model',
];

const ACTIVITY = [
  '6 people sketching the checkout flow',
  'Frames regrouped into three swimlanes',
  '42 sticky notes clustered by theme',
  'Arrows rerouted across the systems map',
  'Guest joined from a viewer link',
  'Follow mode on — 9 viewers trailing',
  'Screens dropped in for design review',
  'Laser pointer walking through the plan',
  'Board exported to PNG with scene data',
  'Sprint columns reordered by priority',
  'Text pass over the architecture diagram',
  'Freehand strokes snapped into shapes',
  'Share link set to expire in 24h',
  'Board restored from trash',
];

const REGIONS = ['us-east', 'eu-west', 'ap-south', 'us-west', 'eu-central'];
const STATUSES = [
  { label: 'editing', color: '#4ade80' },
  { label: 'editing', color: '#4ade80' },
  { label: 'editing', color: '#4ade80' },
  { label: 'idle', color: '#facc15' },
  { label: 'saved', color: '#60a5fa' },
];

type BoardRow = {
  id: string;
  name: string;
  activity: string;
  region: string;
  status: (typeof STATUSES)[number];
  progress: number;
  elapsed: string;
  key: number;
};

function randomRow(key: number): BoardRow {
  return {
    id: Math.random().toString(36).slice(2, 8).toUpperCase(),
    name: BOARD_NAMES[Math.floor(Math.random() * BOARD_NAMES.length)]!,
    activity: ACTIVITY[Math.floor(Math.random() * ACTIVITY.length)]!,
    region: REGIONS[Math.floor(Math.random() * REGIONS.length)]!,
    status: STATUSES[Math.floor(Math.random() * STATUSES.length)]!,
    progress: Math.floor(Math.random() * 85 + 10),
    elapsed: `${Math.floor(Math.random() * 14 + 1)}m ${Math.floor(Math.random() * 59)}s`,
    key,
  };
}

// Animated progress bar that slowly ticks forward
function ProgressBar({ initial }: { initial: number }) {
  const [pct, setPct] = useState(initial);
  const rafRef = useRef<number>(0);
  const pctRef = useRef(initial);

  useEffect(() => {
    const tick = () => {
      pctRef.current = Math.min(99, pctRef.current + 0.015);
      setPct(Math.round(pctRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div style={{ width: '100%', height: 2, background: 'rgba(0,0,0,0.08)', borderRadius: 9 }}>
      <div
        style={{
          height: '100%',
          borderRadius: 9,
          width: `${pct}%`,
          background: 'rgba(0,0,0,0.35)',
          transition: 'width 0.5s linear',
        }}
      />
    </div>
  );
}

// Stable seed rows — same on server and client, no random values
const SEED_ROWS: BoardRow[] = [
  {
    id: 'A1B2C3',
    name: 'q3-roadmap',
    activity: 'Sprint columns reordered by priority',
    region: 'us-east',
    status: STATUSES[0]!,
    progress: 42,
    elapsed: '3m 12s',
    key: 0,
  },
  {
    id: 'D4E5F6',
    name: 'onboarding-flow',
    activity: '6 people sketching the checkout flow',
    region: 'eu-west',
    status: STATUSES[0]!,
    progress: 67,
    elapsed: '7m 48s',
    key: 1,
  },
  {
    id: 'G7H8I9',
    name: 'auth-redesign',
    activity: 'Screens dropped in for design review',
    region: 'us-west',
    status: STATUSES[3]!,
    progress: 18,
    elapsed: '1m 05s',
    key: 2,
  },
  {
    id: 'J0K1L2',
    name: 'systems-map',
    activity: 'Arrows rerouted across the systems map',
    region: 'eu-central',
    status: STATUSES[0]!,
    progress: 55,
    elapsed: '5m 30s',
    key: 3,
  },
  {
    id: 'M3N4O5',
    name: 'retro-april',
    activity: '42 sticky notes clustered by theme',
    region: 'ap-south',
    status: STATUSES[0]!,
    progress: 80,
    elapsed: '11m 22s',
    key: 4,
  },
  {
    id: 'P6Q7R8',
    name: 'brand-refresh',
    activity: 'Board exported to PNG with scene data',
    region: 'us-east',
    status: STATUSES[4]!,
    progress: 99,
    elapsed: '14m 01s',
    key: 5,
  },
];

export function LiveBoardFeed() {
  const [rows, setRows] = useState<BoardRow[]>(SEED_ROWS);
  const keyRef = useRef(100);

  useEffect(() => {
    // The server has to render a fixed table or the markup won't match on
    // hydration; the random rows can only be swapped in once we're on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(Array.from({ length: 6 }, (_, i) => randomRow(i)));

    const t = setInterval(() => {
      keyRef.current++;
      setRows((prev) => [...prev.slice(1), randomRow(keyRef.current)]);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.7)',
      }}
    >
      {/* Table header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr 80px 70px',
          padding: '8px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          background: 'rgba(0,0,0,0.03)',
        }}
      >
        {['BOARD', 'ACTIVITY', 'REGION', 'STATUS'].map((h) => (
          <span
            key={h}
            style={{
              fontSize: 8,
              letterSpacing: '0.16em',
              color: 'rgba(0,0,0,0.30)',
              fontFamily: 'monospace',
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <div
            key={row.key}
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 80px 70px',
              padding: '10px 16px',
              borderBottom: '1px solid rgba(0,0,0,0.04)',
              gap: 8,
              alignItems: 'center',
              animation:
                i === rows.length - 1 ? 'rowSlideIn 0.4s cubic-bezier(0.16,1,0.3,1) both' : 'none',
            }}
          >
            {/* Board */}
            <div>
              <div
                style={{
                  fontSize: 9,
                  fontFamily: 'monospace',
                  color: 'rgba(0,0,0,0.65)',
                  marginBottom: 1,
                }}
              >
                {row.name}
              </div>
              <div style={{ fontSize: 7.5, fontFamily: 'monospace', color: 'rgba(0,0,0,0.25)' }}>
                #{row.id}
              </div>
            </div>

            {/* Activity + progress */}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  color: 'rgba(0,0,0,0.50)',
                  lineHeight: 1.35,
                  marginBottom: 5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {row.activity}
              </div>
              <ProgressBar initial={row.progress} />
            </div>

            {/* Region */}
            <div style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(0,0,0,0.30)' }}>
              {row.region}
            </div>

            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: row.status.color,
                  boxShadow:
                    row.status.label === 'editing' ? `0 0 6px ${row.status.color}` : 'none',
                  animation:
                    row.status.label === 'editing' ? 'statusPulse 2s ease-in-out infinite' : 'none',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 8, fontFamily: 'monospace', color: 'rgba(0,0,0,0.35)' }}>
                {row.status.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes rowSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes statusPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export function LiveBoardCounter() {
  const [count, setCount] = useState(3847);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Same reason as the feed above: the server renders the seed figure and the
    // client takes over the ticking count after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const t = setInterval(() => {
      setCount((v) => v + Math.floor(Math.random() * 3 - 1));
    }, 1200);
    return () => clearInterval(t);
  }, []);

  return (
    <span
      style={{
        fontFamily: 'monospace',
        fontSize: 'clamp(3rem, 6vw, 5rem)',
        fontWeight: 300,
        color: 'rgba(0,0,0,0.85)',
        lineHeight: 1,
        letterSpacing: '-0.02em',
        transition: 'color 0.3s ease',
      }}
    >
      {mounted ? count.toLocaleString('en-US') : '3,847'}
    </span>
  );
}
