import { Eye, Pencil, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The tag colours a board can carry, as the editor's sidebar names them. */
type BoardColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray';

/**
 * The board's initials take its tag colour, as its dot does in the sidebar, so
 * whoever sent the link is looking at the same mark a moment later. Written out
 * whole so the stylesheet keeps every one of them.
 */
const TINTS: Record<BoardColor, string> = {
  red: 'bg-red-500/20 text-red-200',
  orange: 'bg-orange-500/20 text-orange-200',
  yellow: 'bg-yellow-400/20 text-yellow-100',
  green: 'bg-emerald-500/20 text-emerald-200',
  blue: 'bg-blue-500/20 text-blue-200',
  purple: 'bg-violet-500/20 text-violet-200',
  gray: 'bg-white/[0.08] text-white/80',
};

/** The same colour for the sketch's one filled shape, drawn as `currentColor`. */
const SHAPE_FILLS: Record<BoardColor, string> = {
  red: 'text-red-500',
  orange: 'text-orange-500',
  yellow: 'text-yellow-400',
  green: 'text-emerald-500',
  blue: 'text-blue-500',
  purple: 'text-violet-500',
  gray: 'text-white',
};

function initialsOf(title: string): string {
  const letters = title
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  return letters || 'B';
}

/**
 * The board an invite is for, drawn as a small piece of canvas: the dotted
 * ground the editor opens on, a few faint shapes, and the board's name across
 * the bottom with what the link lets you do.
 *
 * The shapes are decoration and say nothing about the board's contents — the
 * page is public to anyone holding the link, and the drawing is not theirs to
 * see until they join.
 */
export function BoardTile({
  title,
  color,
  sharedBy,
  access,
}: {
  title: string;
  color: string;
  sharedBy: string | null;
  /** What joining grants, or that this visitor has been turned away. */
  access: 'editor' | 'viewer' | 'removed';
}) {
  const known = (color in TINTS ? color : 'gray') as BoardColor;
  const tint = TINTS[known];

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
          {/* Filled inside the drawing, so it scales with the outline over it. */}
          <rect
            x="54"
            y="22"
            width="78"
            height="40"
            rx="8"
            className={SHAPE_FILLS[known]}
            fill="currentColor"
            fillOpacity="0.16"
            stroke="none"
          />
          <rect x="54" y="22" width="78" height="40" rx="8" />
          <path d="M132 42h46" />
          <path d="M172 37l6 5-6 5" />
          <ellipse cx="214" cy="42" rx="34" ry="20" />
          <path d="M248 42h30" strokeDasharray="3 4" />
          <path d="M296 24l18 18-18 18-18-18z" />
        </svg>
      </div>

      <div className="flex items-center gap-3 px-4 py-3.5">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium',
            tint,
          )}
        >
          {initialsOf(title)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-[#F5F4F0]">{title}</p>
          <p className="truncate text-xs text-white/45">
            {sharedBy ? `Shared by ${sharedBy}` : 'Shared board'}
          </p>
        </div>
        <AccessChip access={access} />
      </div>
    </div>
  );
}

function AccessChip({ access }: { access: 'editor' | 'viewer' | 'removed' }) {
  if (access === 'removed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-xs text-red-300">
        <UserX size={12} aria-hidden="true" />
        No access
      </span>
    );
  }

  const Icon = access === 'viewer' ? Eye : Pencil;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.04] px-2.5 py-1 text-xs text-white/75">
      <Icon size={12} aria-hidden="true" />
      {access === 'viewer' ? 'Can view' : 'Can edit'}
    </span>
  );
}
