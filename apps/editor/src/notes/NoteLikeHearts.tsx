import { useMemo } from 'react';
import { Heart } from 'lucide-react';
import { noteLikeSpot, shapeScale, type NoteShape } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { listed, t as translate, useT } from '../i18n';
import type { Camera } from '../machine/tool-machine.types';
import type { Size } from '../properties/halo-placement';
import type { NoteLike, NoteLikes } from './note-likes';

/** Below this, a note is too small on screen for a heart anyone could press. */
const MIN_ON_SCREEN = 0.5;
/** Liked: the red a heart is everywhere else. */
const LIKED_COLOR = '#e03131';
/** Names spelled out on hover before the rest are counted. */
const NAMED = 3;

export interface NoteHeart {
  readonly noteId: string;
  /** The left-hand end and middle of the heart and its count, in board pixels. */
  readonly left: number;
  readonly y: number;
  /** The heart's height in pixels: it grows and shrinks with the note. */
  readonly size: number;
  /** How many like the note, or null where that is not to be shown. */
  readonly count: number | null;
  readonly mine: boolean;
  readonly likes: readonly NoteLike[];
}

/**
 * A heart for every note on screen that should have one.
 *
 * Anyone who can edit the board gets one on every note, to like it with.
 * Anyone who cannot sees the ones somebody has liked, and nothing else. With
 * likes hidden, nobody sees a count or anyone else's like — only an editor's
 * own heart, so they can still give and take back theirs.
 */
export function heartsOnScreen(
  notes: readonly NoteShape[],
  camera: Camera,
  board: Size,
  likes: NoteLikes,
  userId: string | null,
  canLike: boolean,
): NoteHeart[] {
  const hearts: NoteHeart[] = [];
  for (const note of notes) {
    if (camera.zoom * shapeScale(note) < MIN_ON_SCREEN) continue;
    const given = likes.byNote.get(note.id) ?? [];
    const mine = userId !== null && given.some((like) => like.userId === userId);
    if (likes.hidden ? !canLike : !canLike && given.length === 0) continue;

    const spot = noteLikeSpot(note);
    const left = (spot.left - camera.x) * camera.zoom;
    const y = (spot.y - camera.y) * camera.zoom;
    const size = spot.size * camera.zoom;
    if (left + size * 4 < 0 || left > board.width || y + size < 0 || y - size > board.height) {
      continue;
    }
    hearts.push({
      noteId: note.id,
      left,
      y,
      size,
      count: likes.hidden || given.length === 0 ? null : given.length,
      mine,
      likes: likes.hidden ? [] : given,
    });
  }
  return hearts;
}

/** "Liked by You, Asha and Ravi", "Liked by Asha, Ravi and 4 others". */
export function likedBy(likes: readonly NoteLike[], userId: string | null): string {
  const names = likes.map((like) =>
    like.userId === userId ? translate('comments.you') : like.name || translate('comments.someone'),
  );
  if (names.length <= NAMED) return translate('notes.likedBy', { who: listed(names) });
  return translate('notes.likedByMore', {
    who: names.slice(0, NAMED - 1).join(', '),
    count: names.length - (NAMED - 1),
  });
}

interface NoteLikeHeartsProps {
  notes: readonly NoteShape[];
  camera: Camera;
  board: Size;
  likes: NoteLikes;
  userId: string | null;
  /** Off for a viewer: the hearts can be read and not pressed. */
  canLike: boolean;
  onToggle: (noteId: string) => void;
}

/**
 * The hearts under the notes, drawn over the canvas so a press on one never
 * reaches the board to select or drag what is beneath. On the board rather
 * than the paper, so in the board's ink, as the author's name beside them is.
 */
export function NoteLikeHearts({
  notes,
  camera,
  board,
  likes,
  userId,
  canLike,
  onToggle,
}: NoteLikeHeartsProps) {
  const t = useT();
  const hearts = useMemo(
    () => heartsOnScreen(notes, camera, board, likes, userId, canLike),
    [notes, camera, board, likes, userId, canLike],
  );
  if (hearts.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-(--zIndex-wysiwyg) overflow-hidden"
      data-testid="note-likes"
    >
      {hearts.map((heart) => {
        const hint = likes.hidden
          ? t('notes.likesHidden')
          : heart.likes.length > 0
            ? likedBy(heart.likes, userId)
            : undefined;
        const label = canLike ? (heart.mine ? t('notes.unlike') : t('notes.like')) : hint;
        const body = (
          <>
            <Heart
              aria-hidden="true"
              style={{ width: heart.size, height: heart.size }}
              fill={heart.mine ? LIKED_COLOR : 'none'}
              strokeWidth={2.25}
            />
            {heart.count !== null && <span className="tabular-nums">{heart.count}</span>}
          </>
        );
        // The padding is taken back off the left, so the heart itself lines
        // up with the paper's edge.
        const pad = heart.size * 0.25;
        const style = {
          left: heart.left - pad,
          top: heart.y,
          fontSize: heart.size * 0.8,
          gap: heart.size * 0.25,
          padding: pad,
          ...(heart.mine && { color: LIKED_COLOR }),
        };
        const classes = cn(
          'absolute flex -translate-y-1/2 items-center rounded-full leading-none font-medium',
          !heart.mine && 'text-neutral-600 dark:text-neutral-300',
        );
        return canLike ? (
          <button
            key={heart.noteId}
            type="button"
            title={hint}
            aria-label={hint ? `${label} — ${hint}` : label}
            aria-pressed={heart.mine}
            data-testid="note-like"
            className={cn(
              classes,
              'pointer-events-auto outline-none hover:bg-neutral-950/8 dark:hover:bg-neutral-50/10 focus-visible:outline-2 focus-visible:outline-(--focus-highlight-color)',
            )}
            style={style}
            // Kept from the board, which would take the press for one on the
            // note and start a drag, or a double press for opening its words.
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(heart.noteId);
            }}
          >
            {body}
          </button>
        ) : (
          <span
            key={heart.noteId}
            role="img"
            title={hint}
            aria-label={label}
            data-testid="note-like"
            className={cn(classes, 'pointer-events-auto')}
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {body}
          </span>
        );
      })}
    </div>
  );
}
