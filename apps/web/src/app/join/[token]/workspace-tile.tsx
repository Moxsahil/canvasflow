import { Shield, UserRound } from 'lucide-react';

function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return letters || 'W';
}

/**
 * The workspace an invitation is for, drawn like the share page's board tile:
 * the editor's dotted ground, here holding a few board cards side by side —
 * a workspace is the place its boards live — and its name across the bottom
 * with the role joining gives.
 *
 * The cards are decoration and say nothing about the boards inside: the page
 * is open to anyone holding the link, and the boards are not theirs to see
 * until they join.
 */
export function WorkspaceTile({
  name,
  invitedBy,
  role,
}: {
  name: string;
  invitedBy: string;
  role: 'admin' | 'member';
}) {
  const RoleIcon = role === 'admin' ? Shield : UserRound;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]">
      <div
        aria-hidden="true"
        className="relative h-[84px] border-b border-white/[0.06]"
        style={{
          backgroundImage: 'radial-gradient(rgba(245, 244, 240, 0.09) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
          backgroundPosition: '7px 7px',
        }}
      >
        <svg
          viewBox="0 0 360 84"
          className="absolute inset-0 h-full w-full"
          fill="none"
          stroke="rgba(245, 244, 240, 0.22)"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {[
            { x: 62, fill: 'text-blue-500' },
            { x: 146, fill: 'text-violet-500' },
            { x: 230, fill: 'text-emerald-500' },
          ].map(({ x, fill }) => (
            <g key={x}>
              <rect
                x={x}
                y="18"
                width="68"
                height="48"
                rx="7"
                className={fill}
                fill="currentColor"
                fillOpacity="0.12"
                stroke="none"
              />
              <rect x={x} y="18" width="68" height="48" rx="7" />
              <path d={`M${x + 10} 52h26`} />
              <path d={`M${x + 10} 30h14`} strokeOpacity="0.6" />
            </g>
          ))}
        </svg>
      </div>

      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-sm font-medium text-white/80">
          {initialsOf(name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-[#fafafa]">{name}</p>
          <p className="truncate text-xs text-white/45">{`Invited by ${invitedBy}`}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-xs text-white/75">
          <RoleIcon size={12} aria-hidden="true" />
          {role === 'admin' ? 'Admin' : 'Member'}
        </span>
      </div>
    </div>
  );
}
