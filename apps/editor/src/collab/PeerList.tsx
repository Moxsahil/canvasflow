import { Users } from 'lucide-react';
import {
  presenceColorFor,
  presenceInitial,
  presenceTagTextColor,
  type PresenceTheme,
} from '@canvasflow/canvas-engine';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RosterEntry } from './usePeerPresence';

interface PeerListProps {
  roster: readonly RosterEntry[];
  theme: PresenceTheme;
  following: string | null;
  onFollow: (userId: string) => void;
  onStopFollowing: () => void;
  onShare: () => void;
  readOnly?: boolean;
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer: HTMLElement | null;
}

const MAX_VISIBLE = 3;
const AVATAR = 26;
const OVERLAP = 8;

/**
 * Who is on the board, top-right.
 *
 * That corner is reserved by prior decision, not chance: PropertiesPanel.css
 * centres itself on the right edge specifically to stay "clear of the top-right
 * corner, which is reserved for other controls".
 *
 * The share button turns green with a live count while anyone else is here.
 * That colour answers the one question a host has after sending a link — did it
 * work — which the share dialog cannot answer, because by then it is closed.
 */
export function PeerList({
  roster,
  theme,
  following,
  onFollow,
  onStopFollowing,
  onShare,
  readOnly = false,
  portalContainer,
}: PeerListProps) {
  const others = roster.filter((entry) => !entry.isSelf);
  const isLive = others.length > 0;

  // Self last, nearest the edge, so the people you are working with read first
  // and your own avatar never shifts as others come and go.
  const ordered = [...others, ...roster.filter((entry) => entry.isSelf)];
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - visible.length;

  return (
    <div className="cf-peer-list">
      {readOnly && (
        <span className="cf-peer-list__badge" title="You can watch this board, but not change it">
          View only
        </span>
      )}

      {isLive && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="cf-peer-list__avatars"
              title={`${others.length} ${others.length === 1 ? 'person' : 'people'} here`}
              aria-label={`${others.length} ${others.length === 1 ? 'collaborator' : 'collaborators'} — show who is here`}
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
                  className="cf-peer-list__disc cf-peer-list__disc--overflow"
                  style={{ marginLeft: -OVERLAP }}
                >
                  +{overflow}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" container={portalContainer} className="min-w-60">
            <DropdownMenuLabel className="text-(--keybinding-color)">
              Click someone to follow them
            </DropdownMenuLabel>
            {ordered.map((entry) => (
              <PeerRow
                key={entry.userId}
                entry={entry}
                theme={theme}
                isFollowing={following === entry.userId}
                onSelect={() =>
                  entry.isSelf
                    ? undefined
                    : following === entry.userId
                      ? onStopFollowing()
                      : onFollow(entry.userId)
                }
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <button
        type="button"
        onClick={onShare}
        className={`cf-peer-list__share${isLive ? ' cf-peer-list__share--live' : ''}`}
        title={isLive ? 'Collaboration is live — manage links' : 'Share this board'}
      >
        <Users className="h-4 w-4" aria-hidden="true" />
        Share
        {isLive && (
          <span className="cf-peer-list__count" aria-hidden="true">
            {roster.length}
          </span>
        )}
      </button>
    </div>
  );
}

function Avatar({
  entry,
  theme,
  offset,
}: {
  entry: RosterEntry;
  theme: PresenceTheme;
  offset: number;
}) {
  const color = presenceColorFor(entry.userId, theme);
  const label = entry.isSelf ? `${entry.name} (you)` : entry.name;

  return (
    <span
      className="cf-peer-list__disc"
      title={entry.activity === 'away' ? `${label} — away` : label}
      style={{
        marginLeft: offset,
        background: color,
        color: presenceTagTextColor(theme),
        // Dimmed rather than hidden: someone idle is still in the room, and
        // removing them would make the bar jump whenever a person pauses.
        opacity: entry.activity === 'active' ? 1 : 0.45,
        width: AVATAR,
        height: AVATAR,
      }}
    >
      {presenceInitial(entry.name)}
    </span>
  );
}

function PeerRow({
  entry,
  theme,
  isFollowing,
  onSelect,
}: {
  entry: RosterEntry;
  theme: PresenceTheme;
  isFollowing: boolean;
  onSelect: () => void;
}) {
  const color = presenceColorFor(entry.userId, theme);

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={entry.isSelf}
      className="cf-peer-list__row"
      aria-pressed={isFollowing}
    >
      <span
        className="cf-peer-list__disc cf-peer-list__disc--sm"
        style={{
          background: color,
          color: presenceTagTextColor(theme),
          opacity: entry.activity === 'active' ? 1 : 0.45,
        }}
        aria-hidden="true"
      >
        {presenceInitial(entry.name)}
      </span>
      <span className="cf-peer-list__name">{entry.name}</span>
      {entry.isSelf ? (
        <span className="cf-peer-list__hint">(You)</span>
      ) : isFollowing ? (
        <span className="cf-peer-list__hint cf-peer-list__hint--active">Following</span>
      ) : (
        entry.activity !== 'active' && <span className="cf-peer-list__hint">{entry.activity}</span>
      )}
    </button>
  );
}
