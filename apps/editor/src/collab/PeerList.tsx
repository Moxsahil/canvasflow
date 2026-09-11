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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { AvatarStack } from '@/components/kibo-ui/avatar-stack';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useAvatarUrls } from '../profile';
import type { RosterEntry } from './usePeerPresence';

interface PeerListProps {
  roster: readonly RosterEntry[];
  /** The board these people share, which is what authorizes seeing a photo. */
  boardId: string;
  /** The editor's bearer token, for the same. */
  authToken: string | null;
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

/**
 * Who is on the board, top-right.
 *
 * That corner is reserved by prior decision, not chance: PropertiesPanel.css
 * centres itself on the right edge specifically to stay "clear of the top-right
 * corner, which is reserved for other controls".
 *
 * Who is here and the invitation to bring someone are two separate controls, so
 * they are two separate surfaces — the dock spaces them apart. The share button
 * turns green with a live count while anyone else is here. That colour answers
 * the one question a host has after sending a link — did it work — which the
 * share dialog cannot answer, because by then it is closed.
 */
export function PeerList({
  roster,
  boardId,
  authToken,
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

  /**
   * Photos for the faces on show.
   *
   * Only for people whose presence record names one, which is only ever a photo
   * uploaded here — so nobody appears as a sign-in provider's generated avatar,
   * and everyone else keeps the coloured initial that already identifies them.
   */
  const photos = useAvatarUrls({
    boardId,
    token: authToken,
    subjects: useMemo(
      () =>
        roster
          .filter((entry) => entry.avatarVersion !== null)
          .map((entry) => ({ id: entry.userId, version: entry.avatarVersion })),
      [roster],
    ),
  });

  // Self last, nearest the edge, so the people you are working with read first
  // and your own avatar never shifts as others come and go.
  const ordered = [...others, ...roster.filter((entry) => entry.isSelf)];
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - visible.length;

  return (
    <>
      {readOnly && (
        <span className="cf-peer-list__badge" title="You can watch this board, but not change it">
          View only
        </span>
      )}

      {isLive && (
        <div className="cf-peer-stack">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="cf-peer-stack__trigger"
                title={`${others.length} ${others.length === 1 ? 'person' : 'people'} here`}
                aria-label={`${others.length} ${others.length === 1 ? 'collaborator' : 'collaborators'} — show who is here`}
              >
                <AvatarStack size={AVATAR} animate>
                  {visible.map((entry) => (
                    <PeerAvatar
                      key={entry.userId}
                      entry={entry}
                      photo={photos[entry.userId] ?? null}
                      theme={theme}
                    />
                  ))}
                  {overflow > 0 && (
                    <Avatar>
                      <AvatarFallback className="bg-(--button-hover-bg) text-[11px] text-(--text-primary-color)">
                        +{overflow}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </AvatarStack>
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
                  photo={photos[entry.userId] ?? null}
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
        </div>
      )}

      {/* The count rides on the wrapper, not inside the button: the button
          clips its own overflow so the fill can sweep across it, which would
          crop a badge sitting on the corner. */}
      <span className="relative inline-flex">
        <InteractiveHoverButton
          type="button"
          text="Share"
          onClick={onShare}
          title={isLive ? 'Collaboration is live — manage links' : 'Share this board'}
          aria-label={isLive ? 'Collaboration is live — manage links' : 'Share this board'}
          className={cn(
            // Chrome tokens rather than the component palette, so this reads as
            // one family with the search button sitting next to it.
            'h-10 w-28 text-[13px] [&_svg]:size-4',
            'border-(--default-border-color) bg-(--island-bg-color) text-(--text-primary-color)',
            // Green while people are actually here — the answer to "did the
            // link work?". Recolouring the token rather than the utilities
            // keeps the sweep, its text and the badge in step.
            isLive && '[--color-primary:#0f9d58] [--color-primary-foreground:#ffffff]',
          )}
        />
        {isLive && (
          <span className="cf-share-button__count" aria-hidden="true">
            {roster.length}
          </span>
        )}
      </span>
    </>
  );
}

function PeerAvatar({
  entry,
  photo,
  theme,
}: {
  entry: RosterEntry;
  photo: string | null;
  theme: PresenceTheme;
}) {
  const label = entry.isSelf ? `${entry.name} (you)` : entry.name;

  return (
    <Avatar
      title={entry.activity === 'away' ? `${label} — away` : label}
      // Dimmed rather than hidden: someone idle is still in the room, and
      // removing them would make the bar jump whenever a person pauses.
      style={{ opacity: entry.activity === 'active' ? 1 : 0.45 }}
    >
      {/* Radix keeps the fallback showing unless the image actually loads, so
          a photo that fails leaves the colour and initial rather than a hole. */}
      {photo && <AvatarImage src={photo} alt="" />}
      <AvatarFallback
        className="text-[11px]"
        style={{
          background: presenceColorFor(entry.userId, theme, entry.color),
          color: presenceTagTextColor(theme),
        }}
      >
        {presenceInitial(entry.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function PeerRow({
  entry,
  photo,
  theme,
  isFollowing,
  onSelect,
}: {
  entry: RosterEntry;
  photo: string | null;
  theme: PresenceTheme;
  isFollowing: boolean;
  onSelect: () => void;
}) {
  const color = presenceColorFor(entry.userId, theme, entry.color);

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
          // The colour still fills the disc behind a photo, so it shows at the
          // rim and the person stays the same colour they are on the canvas.
          background: color,
          color: presenceTagTextColor(theme),
          opacity: entry.activity === 'active' ? 1 : 0.45,
        }}
        aria-hidden="true"
      >
        {photo ? (
          <img src={photo} alt="" className="size-full rounded-full object-cover" />
        ) : (
          presenceInitial(entry.name)
        )}
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
