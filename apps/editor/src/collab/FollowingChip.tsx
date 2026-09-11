import { X } from 'lucide-react';
import {
  presenceColorFor,
  presenceTagTextColor,
  type PresenceTheme,
} from '@canvasflow/canvas-engine';
import type { CursorColor } from '@canvasflow/types';

interface FollowingChipProps {
  name: string;
  userId: string;
  /** The colour they chose, if any — the chip wears whatever their cursor does. */
  color: CursorColor | null;
  theme: PresenceTheme;
  onStop: () => void;
}

/**
 * "Following <name>", top-centre, while your viewport is being carried.
 *
 * Follow mode moves the board under you without you touching anything, which is
 * alarming if nothing says why. It carries the leader's own colour so the
 * connection to their cursor and avatar is immediate, and an explicit exit —
 * panning or zooming yourself also stops it, but that is a thing you have to
 * discover, whereas a button is a thing you can see.
 */
export function FollowingChip({ name, userId, color, theme, onStop }: FollowingChipProps) {
  const fill = presenceColorFor(userId, theme, color);

  return (
    <div
      className="cf-following-chip"
      style={{ background: fill, color: presenceTagTextColor(theme) }}
      role="status"
    >
      Following {name}
      <button
        type="button"
        className="cf-following-chip__stop"
        onClick={onStop}
        title="Stop following"
        aria-label={`Stop following ${name}`}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
