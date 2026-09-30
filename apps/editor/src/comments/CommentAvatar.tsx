import { useEffect, useState } from 'react';
import {
  presenceColorFor,
  presenceInitial,
  presenceTagTextColor,
  type PresenceTheme,
} from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';

/**
 * Who wrote a comment: their photo, or their initial on the colour they are
 * everywhere else on the board — their cursor, their place in the peer list.
 *
 * A photo that fails to load leaves the initial showing, as it does for peers.
 */
export function CommentAvatar({
  userId,
  name,
  photo,
  theme,
  className,
}: {
  userId: string;
  name: string;
  photo?: string | null;
  theme: PresenceTheme;
  /** At least a size and a text size. */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none',
        className,
      )}
      style={{
        background: presenceColorFor(userId, theme),
        color: presenceTagTextColor(theme),
      }}
    >
      {photo && !failed ? (
        <img
          src={photo}
          alt=""
          draggable={false}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        presenceInitial(name)
      )}
    </span>
  );
}
