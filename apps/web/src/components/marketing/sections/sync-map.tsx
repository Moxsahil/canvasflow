import { Radio } from 'lucide-react';

/**
 * Places on the map in its own units: x is longitude + 180, y is 75 − latitude,
 * the same equirectangular frame `world-dots.svg` was drawn in (360 × 133).
 */
const SERVER = { x: 283.8, y: 73.65 }; // Singapore
const PEOPLE = [
  { name: 'Priya', photo: 'priya', colour: '#22c55e', x: 252.9, y: 55.9 }, // Mumbai
  { name: 'Alex', photo: 'alex', colour: '#f97316', x: 193.4, y: 22.5 }, // Berlin
  { name: 'Sam', photo: 'sam', colour: '#a855f7', x: 331.2, y: 108.9 }, // Sydney
  { name: 'Maya', photo: 'maya', colour: '#ec4899', x: 106, y: 34.3 }, // New York
  { name: 'Leo', photo: 'leo', colour: '#eab308', x: 133.4, y: 98.5 }, // São Paulo
  { name: 'Ana', photo: 'ana', colour: '#14b8a6', x: 183.4, y: 68.5 }, // Lagos
  { name: 'Kenji', photo: 'kenji', colour: '#ef4444', x: 319.7, y: 39.3 }, // Tokyo
] as const;

/** A flight-path curve from one point to another, bowed upward by `lift`. */
function arc(from: { x: number; y: number }, to: { x: number; y: number }, lift: number) {
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - lift;
  return `M${from.x} ${from.y} Q${cx} ${cy} ${to.x} ${to.y}`;
}

/**
 * Priya's edit flies to the server first, then out to everyone else on the
 * board at once. The farther the hop, the higher its arc.
 */
const LEGS = [
  { path: arc(PEOPLE[0], SERVER, 14), points: '0;1;1', times: '0;0.45;1' },
  ...PEOPLE.slice(1).map((person) => ({
    path: arc(SERVER, person, 8 + Math.abs(SERVER.x - person.x) * 0.18),
    points: '0;0;1',
    times: '0;0.5;1',
  })),
];

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

/**
 * The map card's picture: a dotted world under a radial fade, a pin for each
 * person on the board and one for the sync server in Singapore, and an edit
 * flying from Priya to the server and on to the others along flight paths.
 */
export function SyncMap() {
  return (
    <div className="relative -mx-8 aspect-2/1 overflow-hidden">
      {/* The world is wider than the card's 2:1 window; it keeps its own
          shape at the window's height and is cropped at the sides, centred east of
          the middle so every pin, Sydney included, stays in view. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 aspect-[360/133] h-full -translate-x-[63%]"
      >
        <div className="mask-radial-from-35% *:opacity-50">
          <img src="/assets/features/world-dots.svg" alt="" className="size-full opacity-75" />
        </div>
        <svg viewBox="0 0 360 133" className="absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id="sync-arc" x1="0" x2="1">
              <stop offset="0" stopColor="#4d84fd" stopOpacity="0.2" />
              <stop offset="0.5" stopColor="#4d84fd" stopOpacity="1" />
              <stop offset="1" stopColor="#4d84fd" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {LEGS.map((leg) => (
            <g key={leg.path}>
              <path
                d={leg.path}
                fill="none"
                stroke="url(#sync-arc)"
                strokeWidth="0.7"
                strokeDasharray="2 2"
                className="motion-safe:animate-[sync-dash_1.2s_linear_infinite]"
              />
              <circle r="1.5" fill="#fafafa" className="motion-reduce:hidden">
                <animateMotion
                  dur="2.8s"
                  repeatCount="indefinite"
                  path={leg.path}
                  keyPoints={leg.points}
                  keyTimes={leg.times}
                  calcMode="linear"
                />
              </circle>
            </g>
          ))}
        </svg>
        <style>{`@keyframes sync-dash { to { stroke-dashoffset: -4 } }`}</style>

        {PEOPLE.map((person) => (
          <Pin key={person.name} x={person.x} y={person.y}>
            <img
              src={`/assets/features/avatars/${person.photo}.svg`}
              alt=""
              className="aspect-square size-full scale-110 rounded-full object-cover"
              style={{ backgroundColor: person.colour }}
            />
          </Pin>
        ))}
        <Pin x={SERVER.x} y={SERVER.y} server>
          <span className="grid size-full place-items-center rounded-full bg-[#135dfc]">
            <Radio className="size-3.5 text-white" />
          </span>
        </Pin>
      </div>
    </div>
  );
}

/** A map pin: a white teardrop pointing at its place, a round picture in its head. */
function Pin({
  x,
  y,
  server = false,
  children,
}: {
  x: number;
  y: number;
  server?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-[115%]"
      style={{ left: pct(x, 360), top: pct(y, 133) }}
    >
      {/* Smaller on a narrow card, where the map is small and the pins crowd. */}
      <div
        className={`size-8 origin-bottom rotate-45 scale-75 rounded-t-full rounded-l-full p-0.5 shadow-md shadow-black/15 @2xl:scale-100 ${server ? 'bg-[#4d84fd]' : 'bg-white'}`}
      >
        <div className="relative size-7 -rotate-45 overflow-hidden rounded-full shadow-md before:absolute before:inset-0 before:z-10 before:rounded-full before:border before:border-black/20">
          {children}
        </div>
      </div>
    </div>
  );
}
