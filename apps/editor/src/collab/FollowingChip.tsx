import { X } from 'lucide-react';
import {
  presenceColorFor,
  presenceTagTextColor,
  type PresenceTheme,
} from '@canvasflow/canvas-engine';

interface FollowingChipProps {
  name: string;
  userId: string;
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
export function FollowingChip({ name, userId, theme, onStop }: FollowingChipProps) {
  const color = presenceColorFor(userId, theme);

  return (
    <div
      className="cf-following-chip"
      style={{ background: color, color: presenceTagTextColor(theme) }}
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
