import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Check } from 'lucide-react';
import type { PresenceTheme, Shape } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import type { Camera, Point } from '../machine/tool-machine.types';
import { CommentAvatar } from './CommentAvatar';
import { CommentComposer } from './CommentComposer';
import { CommentPeek, PEEK_WIDTH } from './CommentPeek';
import { CommentThreadPanel, THREAD_PANEL_WIDTH } from './CommentThreadPanel';
import { CommentEnvironmentProvider } from './comment-environment';
import {
  NEW_THREAD_DRAFT,
  clearCommentDraft,
  commentDraft,
  saveCommentDraft,
} from './comment-drafts';
import {
  anchorAt,
  anchorPoint,
  type CommentAnchor,
  type CommentAuthor,
  type CommentThread,
} from './comment-model';
import {
  PIN_SIZE,
  isPinOnBoard,
  panelPlacement,
  peekPlacement,
  type Size,
} from './comment-placement';
import type { CommentStore } from './comment-store';

/** A comment being placed and not yet posted: where its pin would go. */
export interface PendingComment {
  readonly anchor: CommentAnchor;
  /** Where the composer stands, on the board. */
  readonly point: Point;
  /** The press that is placing it is still down, and the composer is following it. */
  readonly placing: boolean;
}

export interface CommentsLayerProps {
  threads: readonly CommentThread[];
  /** The threads holding something whoever is looking has not read. */
  unread: ReadonlySet<string>;
  store: CommentStore;
  shapes: readonly Shape[];
  camera: Camera;
  /** The board's size on screen. */
  board: Size;
  /** Whoever is looking, or null before the board knows. */
  user: CommentAuthor | null;
  /** Off for a viewer: threads can be opened and read, and nothing changed. */
  canComment: boolean;
  photos: Readonly<Record<string, string>>;
  theme: PresenceTheme;
  /** Who can be named with an @ in a comment here. */
  people: readonly CommentAuthor[];
  /** The editor root, which what opens from a comment portals into for its theme. */
  container: HTMLElement | null;
  pending: PendingComment | null;
  openThreadId: string | null;
  onOpenThread: (threadId: string | null) => void;
  onClosePending: () => void;
  /** A new thread was posted: the comment tool has done what it was picked up for. */
  onPosted: () => void;
  /** The shape a pin dropped at this point on the board would attach to. */
  targetAt: (point: Point) => Shape | null;
}

/** A press has to travel this far before it is a drag and not a click. */
const DRAG_THRESHOLD = 4;
const PENDING_PANEL_WIDTH = 280;

/**
 * The board's comments, drawn over it: a pin for every thread, the thread that
 * is open beside its pin, and the composer for one being placed.
 *
 * A pin is a face and no more, so the board stays readable under any number of
 * them. What a thread says is shown when its pin is pointed at.
 *
 * Pins sit under the rest of the chrome, so the toolbar and the panels draw
 * over them as they do over the shapes. What opens from a pin sits above it
 * all — a thread is read and written in, and must not be cut off by a panel
 * that happens to be there.
 *
 * Nothing here takes a press meant for the board: the layers themselves are
 * click-through, and only a pin or a panel answers.
 */
export function CommentsLayer({
  threads,
  unread,
  store,
  shapes,
  camera,
  board,
  user,
  canComment,
  photos,
  theme,
  people,
  container,
  pending,
  openThreadId,
  onOpenThread,
  onClosePending,
  onPosted,
  targetAt,
}: CommentsLayerProps) {
  const environment = useMemo(
    () => ({ container, people, photos, theme }),
    [container, people, photos, theme],
  );
  const shapesById = useMemo(() => new Map(shapes.map((shape) => [shape.id, shape])), [shapes]);
  const toScreen = (point: Point): Point => ({
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
  });
  const toWorld = (point: Point): Point => ({
    x: point.x / camera.zoom + camera.x,
    y: point.y / camera.zoom + camera.y,
  });

  // A pin mid-drag stands where the pointer has it, not where its thread says.
  const [drag, setDrag] = useState<{ threadId: string; at: Point } | null>(null);
  // The pin being pointed at, by pointer or by keyboard.
  const [peekId, setPeekId] = useState<string | null>(null);
  const peekLabelId = useId();

  const openThread = threads.find((thread) => thread.id === openThreadId) ?? null;
  // The thread that was open has gone — deleted here, or by someone else.
  useEffect(() => {
    if (openThreadId && !openThread) onOpenThread(null);
  }, [openThreadId, openThread, onOpenThread]);

  const latest = useRef({ openThreadId, pending, onOpenThread, onClosePending });
  latest.current = { openThreadId, pending, onOpenThread, onClosePending };

  // A press anywhere else closes what is open, and Escape does too. Both are
  // heard on the way down, ahead of the board: the canvas keeps the browser
  // from moving focus, so there is no blur to go by, and an Escape that closed
  // a thread should not also clear the selection behind it.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-comment-panel], [data-comment-pin]')) return;
      const { openThreadId: open, pending: placing } = latest.current;
      if (open) latest.current.onOpenThread(null);
      if (placing) latest.current.onClosePending();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const { openThreadId: open, pending: placing } = latest.current;
      if (!open && !placing) return;
      // A field being typed in answers its own Escape: leaving an edit is not
      // closing the thread around it. So does what has opened over the thread
      // — the emoji grid, the list of people.
      if ((event.target as Element | null)?.closest('textarea, input, [data-comment-popup]')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (placing) latest.current.onClosePending();
      else latest.current.onOpenThread(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  const pinOf = (thread: CommentThread): Point =>
    drag?.threadId === thread.id ? drag.at : toScreen(anchorPoint(thread.anchor, shapesById));

  const pins = threads.flatMap((thread) => {
    const at = pinOf(thread);
    const open = thread.id === openThreadId;
    // Kept while open or in hand, wherever it is: a thread must not close
    // because its pin was panned off the edge.
    if (!open && drag?.threadId !== thread.id && !isPinOnBoard(at, board)) return [];
    return [{ thread, at, open }];
  });

  const openPin = openThread ? pinOf(openThread) : null;
  // Nothing to say in short about a thread that is open in full, and nothing
  // to read while a pin is in hand or a new comment is being written.
  const peeked =
    drag || pending || peekId === openThreadId
      ? null
      : (pins.find(({ thread }) => thread.id === peekId) ?? null);
  const pendingPin = pending ? toScreen(pending.point) : null;

  return (
    <CommentEnvironmentProvider value={environment}>
      <div
        className="pointer-events-none absolute inset-0 z-(--zIndex-wysiwyg) overflow-hidden"
        data-testid="comments-layer"
      >
        {pins.map(({ thread, at, open }) => (
          <ThreadPin
            key={thread.id}
            thread={thread}
            at={at}
            open={open}
            unread={unread.has(thread.id)}
            describedBy={peeked?.thread.id === thread.id ? peekLabelId : undefined}
            photo={photos[thread.comments[0]!.authorId]}
            theme={theme}
            canMove={canComment}
            onPeek={(showing) =>
              setPeekId((current) => (showing ? thread.id : current === thread.id ? null : current))
            }
            onToggle={() => onOpenThread(open ? null : thread.id)}
            onDrag={(point) => setDrag({ threadId: thread.id, at: point })}
            onDrop={(point) => {
              setDrag(null);
              if (!point) return;
              const world = toWorld(point);
              store.moveThread(thread.id, anchorAt(world, targetAt(world)));
            }}
          />
        ))}
        {pending && pendingPin && user && (
          <div
            className="absolute"
            style={{ left: pendingPin.x, top: pendingPin.y, transform: 'translate(0, -100%)' }}
          >
            <PinMarker open>
              <CommentAvatar
                userId={user.id}
                name={user.name}
                photo={photos[user.id]}
                theme={theme}
                className="size-[22px] text-[11px]"
              />
            </PinMarker>
          </div>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 z-(--zIndex-popup)">
        {peeked && (
          // Keyed by thread: the card for the next pin is measured afresh, not
          // placed by the height of the last one.
          <Placed
            key={peeked.thread.id}
            pin={peeked.at}
            width={PEEK_WIDTH}
            board={board}
            place={peekPlacement}
            // Shown, never used: the pointer is on the pin, and a card that took
            // it would end the pointing that raised it.
            inert
          >
            <CommentPeek thread={peeked.thread} id={peekLabelId} />
          </Placed>
        )}
        {openThread && openPin && (
          <Placed pin={openPin} width={THREAD_PANEL_WIDTH} board={board}>
            <CommentThreadPanel
              key={openThread.id}
              thread={openThread}
              user={user}
              canComment={canComment}
              photos={photos}
              theme={theme}
              onReply={(body, mentions) =>
                user && store.addComment(openThread.id, user, body, mentions)
              }
              onEdit={(commentId, body, mentions) =>
                store.editComment(openThread.id, commentId, body, mentions)
              }
              onReact={(commentId, emoji) =>
                user && store.toggleReaction(openThread.id, commentId, user, emoji)
              }
              onDeleteComment={(commentId) => store.deleteComment(openThread.id, commentId)}
              onResolve={() => user && store.resolveThread(openThread.id, user)}
              onReopen={() => store.reopenThread(openThread.id)}
              onDeleteThread={() => store.deleteThread(openThread.id)}
              onClose={() => onOpenThread(null)}
            />
          </Placed>
        )}
        {pending && pendingPin && user && canComment && (
          <Placed
            pin={pendingPin}
            width={PENDING_PANEL_WIDTH}
            board={board}
            // Following the pointer, it must not come between the pointer and
            // the board the press is still travelling over.
            inert={pending.placing}
          >
            <NewThreadComposer
              onPost={(body, mentions) => {
                if (store.addThread(pending.anchor, user, body, mentions)) onPosted();
                onClosePending();
              }}
              onCancel={onClosePending}
            />
          </Placed>
        )}
      </div>
    </CommentEnvironmentProvider>
  );
}

/** The composer for a thread that does not exist yet. */
function NewThreadComposer({
  onPost,
  onCancel,
}: {
  onPost: (body: string, mentions: CommentAuthor[]) => void;
  onCancel: () => void;
}) {
  // Put back from the last placement that was closed without posting.
  const [body, setBody] = useState(() => commentDraft(NEW_THREAD_DRAFT));
  return (
    <div
      className={cn(menuSurfaceClasses, 'p-2 text-xs')}
      style={{ width: PENDING_PANEL_WIDTH }}
      data-testid="comment-new"
    >
      <CommentComposer
        value={body}
        onChange={(next) => {
          setBody(next);
          saveCommentDraft(NEW_THREAD_DRAFT, next);
        }}
        onSubmit={(mentions) => {
          clearCommentDraft(NEW_THREAD_DRAFT);
          onPost(body, mentions);
        }}
        onCancel={onCancel}
        placeholder="Add a comment, @mention someone…"
        sendLabel="Post comment"
        autoFocus
      />
    </div>
  );
}

/**
 * A panel standing beside a pin, kept on the board.
 *
 * It measures itself, since a thread is as tall as what has been said in it,
 * and stays hidden for the one frame before it knows — a panel that appeared
 * at the pin and then hopped clear of the board's edge would read as a glitch.
 */
function Placed({
  pin,
  width,
  board,
  place = panelPlacement,
  inert,
  children,
}: {
  pin: Point;
  width: number;
  board: Size;
  /** Where beside the pin it stands. */
  place?: typeof panelPlacement;
  inert?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);

  const { left, top } = place(pin, { width, height: height ?? 0 }, board);
  return (
    <div
      ref={ref}
      data-comment-panel
      className={cn('absolute', inert ? 'pointer-events-none' : 'pointer-events-auto')}
      // Transparent rather than hidden for that frame: a hidden field cannot
      // take focus, and the composer asks for it the moment it mounts.
      style={{ left, top, opacity: height === null ? 0 : undefined }}
    >
      {children}
    </div>
  );
}

/** The pin's face: a teardrop with its point on the spot the thread is about. */
function PinMarker({
  open,
  resolved,
  unread,
  children,
}: {
  open?: boolean;
  resolved?: boolean;
  /** Something in the thread has not been read here. */
  unread?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'relative flex items-center justify-center rounded-full rounded-bl-none border shadow-[0_1px_2px_rgb(0_0_0/0.28),0_2px_6px_rgb(0_0_0/0.14)] transition-transform duration-75',
        // Ink as well as ground: the marker is a surface of its own on the
        // board, with nothing above it to take a text colour from.
        resolved
          ? 'border-neutral-300 bg-neutral-200 text-neutral-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-300'
          : 'border-neutral-300 bg-neutral-50 text-neutral-950 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-50',
        open && 'outline-2 outline-offset-1 outline-(--color-primary)',
      )}
      style={{ width: PIN_SIZE, height: PIN_SIZE }}
    >
      {resolved ? <Check aria-hidden="true" className="size-3.5" /> : children}
      {unread && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 size-2.5 rounded-full bg-(--color-primary) ring-2 ring-neutral-50 dark:ring-neutral-800"
          data-testid="comment-pin-unread"
        />
      )}
    </span>
  );
}

interface ThreadPinProps {
  thread: CommentThread;
  /** Where the pin's point is, on screen. */
  at: Point;
  open: boolean;
  unread: boolean;
  /** The card saying what is in the thread, while it is showing. */
  describedBy?: string;
  photo?: string;
  theme: PresenceTheme;
  /** Whether the pin can be picked up and put somewhere else. */
  canMove: boolean;
  /** The pin is being pointed at, or no longer is. */
  onPeek: (showing: boolean) => void;
  onToggle: () => void;
  onDrag: (at: Point) => void;
  /** Let go, at this point — or null when the drag was called off. */
  onDrop: (at: Point | null) => void;
}

/**
 * One thread's pin. A click opens the thread; a drag moves the pin, and with
 * it what the thread is about.
 */
function ThreadPin({
  thread,
  at,
  open,
  unread,
  describedBy,
  photo,
  theme,
  canMove,
  onPeek,
  onToggle,
  onDrag,
  onDrop,
}: ThreadPinProps) {
  const first = thread.comments[0]!;
  const name = first.authorName || 'Someone';
  const press = useRef<{ x: number; y: number; origin: Point; moved: boolean } | null>(null);

  const where = (event: ReactPointerEvent): Point => {
    const from = press.current!;
    return { x: from.origin.x + event.clientX - from.x, y: from.origin.y + event.clientY - from.y };
  };

  return (
    <button
      type="button"
      data-comment-pin
      data-thread-id={thread.id}
      data-testid="comment-pin"
      aria-label={`Comment by ${name}${thread.resolved ? ', resolved' : ''}${unread ? ', unread' : ''}, ${thread.comments.length} in thread`}
      aria-expanded={open}
      aria-describedby={describedBy}
      className={cn(
        'pointer-events-auto absolute touch-none border-0 bg-transparent p-0 outline-none hover:[&>span]:scale-105 focus-visible:[&>span]:outline-2 focus-visible:[&>span]:outline-offset-2 focus-visible:[&>span]:outline-(--focus-highlight-color)',
        open && 'z-10',
        canMove ? 'cursor-pointer' : 'cursor-default',
      )}
      style={{ left: at.x, top: at.y, transform: 'translate(0, -100%)' }}
      // A finger has no way to point without pressing, and its press opens
      // the thread.
      onPointerEnter={(event) => event.pointerType !== 'touch' && onPeek(true)}
      onPointerLeave={() => onPeek(false)}
      onFocus={(event) => event.currentTarget.matches(':focus-visible') && onPeek(true)}
      onBlur={() => onPeek(false)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // A press is the start of opening the thread or of moving the pin.
        onPeek(false);
        event.currentTarget.setPointerCapture(event.pointerId);
        press.current = { x: event.clientX, y: event.clientY, origin: at, moved: false };
      }}
      onPointerMove={(event) => {
        const from = press.current;
        if (!from || !canMove) return;
        const far = Math.hypot(event.clientX - from.x, event.clientY - from.y) >= DRAG_THRESHOLD;
        if (!from.moved && !far) return;
        from.moved = true;
        onDrag(where(event));
      }}
      onPointerUp={(event) => {
        const from = press.current;
        if (!from) return;
        const dropped = from.moved ? where(event) : null;
        press.current = null;
        if (dropped) onDrop(dropped);
        else onToggle();
      }}
      onPointerCancel={() => {
        if (press.current?.moved) onDrop(null);
        press.current = null;
      }}
      onClick={(event) => {
        // A pointer's click was already answered on release, where a drag
        // could be told from it. Only the keyboard's arrives here as new.
        if (event.detail === 0) onToggle();
      }}
    >
      <PinMarker open={open} resolved={thread.resolved !== null} unread={unread}>
        <CommentAvatar
          userId={first.authorId}
          name={name}
          photo={photo}
          theme={theme}
          className="size-[22px] text-[11px]"
        />
      </PinMarker>
    </button>
  );
}
