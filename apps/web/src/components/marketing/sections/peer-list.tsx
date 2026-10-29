'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Teammates on the board, in the order the editor lists them: others first, you last. */
const PEOPLE = [
  { name: 'Priya Shah', photo: 'priya', colour: '#22c55e', hint: null, active: true },
  { name: 'Alex Morgan', photo: 'alex', colour: '#f97316', hint: null, active: true },
  { name: 'Sam Lee', photo: 'sam', colour: '#a855f7', hint: 'idle', active: false },
  { name: 'You', photo: 'you', colour: '#4d84fd', hint: '(You)', active: true },
] as const;

/** Height of one row, in px: py-2 around a 24px picture. */
const ROW = 40;

/**
 * Who is on the board, as the editor shows it: the faces and the live Share
 * button along the top, and the list they open, where a click follows someone.
 *
 * It answers like the real one: one highlight glides to whichever row the
 * pointer is over and settles back on the person being followed when it
 * leaves, and clicking someone else follows them instead, the "Following"
 * label moving with the highlight. You can't follow yourself.
 */
export function PeerList() {
  const [following, setFollowing] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const lit = hovered ?? following;

  return (
    <div className="rounded-2xl bg-white/5">
      <div className="flex items-center justify-between px-6 py-2.5" aria-hidden="true">
        <div className="flex -space-x-1.5">
          {PEOPLE.slice(0, 3).map((person) => (
            <Disc key={person.name} {...person} size="size-6.5" ring />
          ))}
          <span className="flex size-6.5 items-center justify-center rounded-full bg-[#27272a] text-[11px] ring-2 ring-[#151517]">
            +1
          </span>
        </div>
        <span className="relative inline-flex items-center gap-1.5 rounded-full bg-[#16a34a] px-3 py-1 text-xs font-semibold text-white">
          <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
          Share
          <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[#16a34a]">
            3
          </span>
        </span>
      </div>
      <div className="rounded-2xl bg-[#111113] px-2 py-2 shadow-md ring-1 shadow-black/5 ring-white/10">
        <div className="px-3 pt-1 pb-2 text-xs text-[#9f9fa9]">Click someone to follow them</div>
        <div className="relative" onMouseLeave={() => setHovered(null)}>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 rounded-lg bg-white/6 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ height: ROW, transform: `translateY(${lit * ROW}px)` }}
          />
          {PEOPLE.map((person, index) => {
            const self = person.hint === '(You)';
            const followed = index === following;
            const hint = followed ? 'Following' : person.hint;
            return (
              <button
                key={person.name}
                type="button"
                disabled={self}
                aria-pressed={followed}
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                onClick={() => setFollowing(index)}
                className="relative flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none disabled:cursor-default"
                style={{ height: ROW }}
              >
                <Disc {...person} size="size-6" />
                <span
                  className={cn(
                    'transition-colors duration-200',
                    person.active || index === lit ? 'text-[#fafafa]' : 'text-[#9f9fa9]',
                  )}
                >
                  {person.name}
                </span>
                {hint && (
                  <span
                    key={hint}
                    className={cn(
                      'ml-auto text-xs motion-safe:animate-[peer-hint_250ms_ease-out]',
                      followed ? 'font-medium text-[#4d84fd]' : 'text-[#9f9fa9]',
                    )}
                  >
                    {hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <style>{`@keyframes peer-hint { from { opacity: 0; transform: translateX(4px) } }`}</style>
      </div>
    </div>
  );
}

/**
 * A person's picture on their colour, dimmed while they're idle, as on the
 * canvas. The pictures are Notionists illustrations (CC0), not real people.
 */
function Disc({
  photo,
  colour,
  active,
  size,
  ring = false,
}: {
  photo: string;
  colour: string;
  active: boolean;
  size: string;
  ring?: boolean;
}) {
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full ${size} ${ring ? 'ring-2 ring-[#151517]' : ''}`}
      style={{ backgroundColor: colour, opacity: active ? 1 : 0.45 }}
    >
      <img src={`/assets/features/avatars/${photo}.svg`} alt="" className="size-full scale-110" />
    </span>
  );
}
