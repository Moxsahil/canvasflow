import { Users } from 'lucide-react';
import { presenceColorFor, presenceInitial, type PresenceTheme } from '@canvasflow/canvas-engine';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RosterEntry } from './roster';

interface CollabBarProps {
  roster: readonly RosterEntry[];
  theme: PresenceTheme;
  onShare: () => void;
  /** Shows a "View only" badge — the toolbar's missing tools need explaining. */
  readOnly?: boolean;
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer: HTMLElement | null;
}

/**
 * Collaboration status, top-right.
 *
 * That corner is where this belongs by prior decision, not by chance:
 * PropertiesPanel.css centres itself on the right edge specifically to stay
 * "clear of the top-right corner, which is reserved for other controls".
 *
 * Follows Excalidraw's arrangement, which solves a real problem: the person who
 * started sharing has no other way to tell whether anyone actually joined. The
 * share button going green with a live count answers that at a glance, and the
 * avatar stack opens into the full list of who is here.
 *
 * Styled with the island tokens rather than the Tailwind lane the menu rail
 * uses — it is floating canvas chrome, so its nearest neighbours are ZoomPanel
 * and Toolbar, and it should read as one of them.
 */
const MAX_VISIBLE = 3;
const AVATAR_SIZE = 26;
const OVERLAP = 8;

export function CollabBar({
  roster,
  theme,
  onShare,
  readOnly = false,
  portalContainer,
}: CollabBarProps) {
  const others = roster.filter((entry) => !entry.isLocal);
  const isLive = others.length > 0;

  // Local user last, nearest the edge, so the people you are working with read
  // first — and so your own avatar never shifts as others come and go.
  const ordered = [...others, ...roster.filter((entry) => entry.isLocal)];
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - visible.length;

  return (
    <div
      style={{
        // Placement belongs to the dock that holds this — see .cf-top-right-dock.
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: 6,
        background: 'var(--island-bg-color)',
        borderRadius: 'var(--border-radius-lg)',
        boxShadow: 'var(--shadow-island)',
      }}
    >
      {readOnly && (
        <span
          title="You can watch this board, but not change it"
          style={{
            padding: '2px 8px',
            borderRadius: 'var(--border-radius-md)',
            border: '1px solid var(--default-border-color)',
            color: 'var(--keybinding-color)',
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          View only
        </span>
      )}

      {isLive && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={`${others.length} ${others.length === 1 ? 'person' : 'people'} on this board`}
              aria-label={`${others.length} ${others.length === 1 ? 'collaborator' : 'collaborators'} — show who is here`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              {visible.map((entry, index) => (
                <Avatar
                  key={entry.userId}
                  entry={entry}
                  theme={theme}
                  offset={index === 0 ? 0 : -OVERLAP}
                />
              ))}
              {overflow > 0 && (
                <span
                  style={{
                    ...discStyle,
                    marginLeft: -OVERLAP,
                    background: 'var(--button-hover-bg)',
                    color: 'var(--text-primary-color)',
                    fontSize: 11,
                  }}
                >
                  +{overflow}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" container={portalContainer} className="min-w-56">
            <DropdownMenuLabel className="text-(--keybinding-color)">
              On this board
            </DropdownMenuLabel>
            {ordered.map((entry) => (
              <PeerRow key={entry.userId} entry={entry} theme={theme} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <button
        type="button"
        onClick={onShare}
        title={isLive ? 'Collaboration is live — manage links' : 'Share this board'}
        aria-label={isLive ? 'Collaboration is live. Manage share links.' : 'Share this board'}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 12px',
          border: 'none',
          borderRadius: 'var(--border-radius-md)',
          // Green while people are actually here. The colour is the answer to
          // "did the link work?" — the one question the host has after sending
          // it, and one the dialog cannot answer because it is closed by then.
          background: isLive ? '#0f9d58' : 'var(--color-surface-primary-container)',
          color: isLive ? '#ffffff' : 'var(--color-on-primary-container)',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'background 150ms ease',
        }}
      >
        <Users className="h-4 w-4" aria-hidden="true" />
        Share
        {isLive && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              padding: '0 4px',
              borderRadius: 9,
              background: '#ffffff',
              color: '#0f9d58',
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '17px',
              textAlign: 'center',
              boxShadow: '0 0 0 2px var(--island-bg-color)',
            }}
          >
            {roster.length}
          </span>
        )}
      </button>
    </div>
  );
}

const discStyle: React.CSSProperties = {
  width: AVATAR_SIZE,
  height: AVATAR_SIZE,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--font-sans)',
  // Separates overlapping avatars from each other, not just from the island.
  border: '2px solid var(--island-bg-color)',
  boxSizing: 'content-box',
  userSelect: 'none',
};

interface AvatarProps {
  entry: RosterEntry;
  theme: PresenceTheme;
  offset: number;
}

function Avatar({ entry, theme, offset }: AvatarProps) {
  const color = presenceColorFor(entry.userId, theme);
  const label = entry.isLocal ? `${entry.name} (you)` : entry.name;

  return (
    <span
      title={entry.activity === 'away' ? `${label} — away` : label}
      aria-label={label}
      style={{
        ...discStyle,
        marginLeft: offset,
        background: color,
        // The palette's light-theme entries are deep and its dark-theme entries
        // pale, so one rule per theme covers every colour in it.
        color: theme === 'dark' ? '#101014' : '#FFFFFF',
        // Dimming rather than hiding: someone idle is still in the room, and
        // removing them would make the bar jump every time a person reads.
        opacity: entry.activity === 'active' ? 1 : 0.45,
        transition: 'opacity 150ms ease',
      }}
    >
      {presenceInitial(entry.name)}
    </span>
  );
}

function PeerRow({ entry, theme }: { entry: RosterEntry; theme: PresenceTheme }) {
  const color = presenceColorFor(entry.userId, theme);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span
        style={{
          ...discStyle,
          width: 20,
          height: 20,
          fontSize: 10,
          border: 'none',
          background: color,
          color: theme === 'dark' ? '#101014' : '#FFFFFF',
          opacity: entry.activity === 'active' ? 1 : 0.45,
        }}
        aria-hidden="true"
      >
        {presenceInitial(entry.name)}
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {entry.isLocal && <span className="text-xs text-(--keybinding-color)">(You)</span>}
      {!entry.isLocal && entry.activity !== 'active' && (
        <span className="text-xs text-(--keybinding-color)">
          {entry.activity === 'away' ? 'away' : 'idle'}
        </span>
      )}
    </div>
  );
}
