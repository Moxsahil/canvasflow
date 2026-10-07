import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Ellipsis, Pencil, Reply, RotateCcw, Trash2, X } from 'lucide-react';
import type { PresenceTheme } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { menuDangerButtonClasses, menuSurfaceClasses } from '@/components/ui/menu-look';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommentAvatar } from './CommentAvatar';
import { CommentBody } from './CommentBody';
import { CommentComposer } from './CommentComposer';
import { CommentReactions } from './CommentReactions';
import { useCommentEnvironment } from './comment-environment';
import { EmojiPopover } from './EmojiPicker';
import { clearCommentDraft, commentDraft, saveCommentDraft } from './comment-drafts';
import {
  canDeleteThread,
  canEditComment,
  type Comment,
  type CommentAuthor,
  type CommentThread,
} from './comment-model';
import { fullDateTime, relativeTime } from './comment-time';

export interface CommentThreadPanelProps {
  thread: CommentThread;
  /** Whoever is looking, or null for someone with no identity to sign a comment with. */
  user: CommentAuthor | null;
  /** Off, the thread can be read and nothing in it changed. */
  canComment: boolean;
  /** Photos by user id, for the authors who have one. */
  photos: Readonly<Record<string, string>>;
  theme: PresenceTheme;
  /** A reply, and the people it names. */
  onReply: (body: string, mentions: CommentAuthor[]) => void;
  onEdit: (commentId: string, body: string, mentions: CommentAuthor[]) => void;
  /** An emoji given to a comment, or taken back if this person had given it. */
  onReact: (commentId: string, emoji: string) => void;
  onDeleteComment: (commentId: string) => void;
  onResolve: () => void;
  onReopen: () => void;
  onDeleteThread: () => void;
  onClose: () => void;
}

const mutedText = 'text-neutral-500 dark:text-neutral-400';
const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color)';
const hairline = 'border-neutral-300 dark:border-neutral-700';

/** The panel's width, which the placement beside the pin is worked out from. */
export const THREAD_PANEL_WIDTH = 300;

/**
 * One thread, opened from its pin: the comments in the order they were made,
 * a field to reply in, and the two things that can be done to the whole of it
 * — settle it, or delete it.
 *
 * A comment is its author's to edit and delete; the controls for that appear
 * on their own comments and nobody else's. Settling and reopening are anyone's
 * who can comment. A thread is its starter's to delete, and asks first: it
 * takes everyone's replies with it.
 */
export function CommentThreadPanel({
  thread,
  user,
  canComment,
  photos,
  theme,
  onReply,
  onEdit,
  onReact,
  onDeleteComment,
  onResolve,
  onReopen,
  onDeleteThread,
  onClose,
}: CommentThreadPanelProps) {
  const { people } = useCommentEnvironment();
  const [reply, setReply] = useState(() => commentDraft(thread.id));
  // Who the reply has been pointed at from a comment's Reply, so their name
  // in it counts even if they could not otherwise be picked; and a nudge to
  // put the caret back in the field once their name is in it.
  const [replyingTo, setReplyingTo] = useState<CommentAuthor[]>([]);
  const [replyFocus, setReplyFocus] = useState(0);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // The newest comment is the one a thread is opened to read, and the one a
  // reply lands under.
  const count = thread.comments.length;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

  const userId = user?.id ?? null;
  const resolved = thread.resolved;
  const mayDeleteThread = canComment && canDeleteThread(thread, userId);

  const send = (mentions: CommentAuthor[]) => {
    onReply(reply, mentions);
    setReply('');
    setReplyingTo([]);
    clearCommentDraft(thread.id);
  };

  const mayReply = canComment && user !== null && !resolved;

  /**
   * Answer a comment: its author named at the end of the reply, as a chat's
   * reply does, and the caret after them. Named by the name the board has for
   * them now, which is what a mention is matched against; not added twice.
   */
  const replyTo = (comment: Comment) => {
    const author = people.find((person) => person.id === comment.authorId) ?? {
      id: comment.authorId,
      name: comment.authorName || 'Someone',
      ...(comment.authorUsername ? { username: comment.authorUsername } : {}),
    };
    const mention = `@${author.name}`;
    const next = reply.includes(mention)
      ? reply
      : `${reply.trim() ? `${reply.trimEnd()} ` : ''}${mention} `;
    setReply(next);
    saveCommentDraft(thread.id, next);
    setReplyingTo((named) =>
      named.some((person) => person.id === author.id) ? named : [...named, author],
    );
    setReplyFocus((n) => n + 1);
  };

  // The comment straight above the reply field, if it is this person's to edit.
  const last = thread.comments[count - 1];
  const editLast =
    canComment && last && canEditComment(last, userId)
      ? () => setEditing({ id: last.id, body: last.body })
      : undefined;

  return (
    <div
      role="dialog"
      aria-label="Comment thread"
      className={cn(menuSurfaceClasses, 'flex flex-col text-xs')}
      style={{ width: THREAD_PANEL_WIDTH }}
      data-testid="comment-thread"
    >
      <div
        className={cn(
          'flex h-9 shrink-0 items-center justify-between border-b pr-1.5 pl-3',
          hairline,
        )}
      >
        {confirmingDelete ? (
          <>
            <span className="font-medium">Delete this thread?</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  'h-6 rounded-md px-2 hover:bg-neutral-950/10 dark:hover:bg-neutral-50/10',
                  focusRing,
                )}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(
                  'h-6 rounded-md px-2 font-medium text-red-500 hover:bg-red-500/15 dark:text-red-400',
                  focusRing,
                )}
                onClick={onDeleteThread}
                data-testid="comment-thread-delete-confirm"
              >
                Delete
              </button>
            </div>
          </>
        ) : (
          <>
            <span className={mutedText}>{count === 1 ? '1 comment' : `${count} comments`}</span>
            <div className="flex items-center gap-0.5">
              {canComment &&
                user &&
                (resolved ? (
                  <HeaderButton label="Reopen" onClick={onReopen} testId="comment-thread-reopen">
                    <RotateCcw aria-hidden="true" />
                  </HeaderButton>
                ) : (
                  <HeaderButton label="Resolve" onClick={onResolve} testId="comment-thread-resolve">
                    <Check aria-hidden="true" />
                  </HeaderButton>
                ))}
              {mayDeleteThread && (
                <HeaderButton
                  label="Delete thread"
                  onClick={() => setConfirmingDelete(true)}
                  testId="comment-thread-delete"
                >
                  <Trash2 aria-hidden="true" />
                </HeaderButton>
              )}
              <HeaderButton label="Close" onClick={onClose} testId="comment-thread-close">
                <X aria-hidden="true" />
              </HeaderButton>
            </div>
          </>
        )}
      </div>

      {resolved && (
        <p className={cn('m-0 border-b px-3 py-2', hairline, mutedText)}>
          Resolved by {resolved.byName || 'someone'} ·{' '}
          <time title={fullDateTime(resolved.at)}>{relativeTime(resolved.at)}</time>
        </p>
      )}

      <div ref={listRef} className="flex max-h-80 flex-col overflow-y-auto py-1">
        {thread.comments.map((comment) =>
          editing?.id === comment.id ? (
            <CommentComposer
              key={comment.id}
              className="px-3 py-2"
              value={editing.body}
              onChange={(body) => setEditing({ id: comment.id, body })}
              onSubmit={(mentions) => {
                onEdit(comment.id, editing.body, mentions);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
              placeholder="Edit comment"
              sendLabel="Save"
              named={comment.mentions}
              autoFocus
            />
          ) : (
            <CommentCard
              key={comment.id}
              comment={comment}
              photo={photos[comment.authorId]}
              theme={theme}
              userId={userId}
              canReact={canComment && user !== null}
              onReact={(emoji) => onReact(comment.id, emoji)}
              onReply={mayReply && comment.authorId !== userId ? () => replyTo(comment) : undefined}
              {...(canComment && canEditComment(comment, userId)
                ? {
                    onEdit: () => setEditing({ id: comment.id, body: comment.body }),
                    onDelete: () => onDeleteComment(comment.id),
                  }
                : {})}
            />
          ),
        )}
      </div>

      {mayReply && user && (
        <CommentComposer
          className={cn('border-t px-3 py-2', hairline)}
          value={reply}
          named={replyingTo}
          focusSignal={replyFocus}
          onChange={(body) => {
            setReply(body);
            saveCommentDraft(thread.id, body);
          }}
          onSubmit={send}
          onCancel={onClose}
          onEditPrevious={editLast}
          placeholder="Reply, @mention someone…"
          sendLabel="Post reply"
          leading={
            <CommentAvatar
              userId={user.id}
              name={user.name}
              photo={photos[user.id]}
              theme={theme}
              className="mt-1 size-6 text-[11px]"
            />
          }
        />
      )}
    </div>
  );
}

/** The look of a button in a comment's actions, as the emoji button has it. */
const actionButton = cn(
  'grid size-6 shrink-0 place-items-center rounded-md hover:bg-neutral-950/10 hover:text-neutral-950 data-[state=open]:bg-neutral-950/10 data-[state=open]:text-neutral-950 dark:hover:bg-neutral-50/10 dark:hover:text-neutral-50 dark:data-[state=open]:bg-neutral-50/10 dark:data-[state=open]:text-neutral-50 [&_svg]:size-3.5',
  mutedText,
  focusRing,
);

/**
 * One comment, as a message: the author's face beside the bubble, and under
 * the bubble, from its edge, who and when.
 *
 * Your own sit on the right, filled in the opposite shade to the panel, and
 * everyone else's on the left in a grey one, so who said what reads at a
 * glance down the thread. The face lines up with the bubble's first line.
 */
function CommentCard({
  comment,
  photo,
  theme,
  userId,
  canReact,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  photo?: string;
  theme: PresenceTheme;
  /** Whoever is looking. */
  userId: string | null;
  canReact: boolean;
  onReact: (emoji: string) => void;
  /** Answer this comment, naming its author. Absent on your own, and where no reply can be written. */
  onReply?: () => void;
  /** Both present only on your own. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const name = comment.authorName || 'Someone';
  const you = comment.authorId === userId;
  return (
    <article
      className={cn('group/card flex items-start gap-2 px-3 py-1.5', you && 'flex-row-reverse')}
      data-testid="comment-card"
      data-comment-id={comment.id}
      data-side={you ? 'end' : 'start'}
    >
      <CommentAvatar
        userId={comment.authorId}
        name={name}
        photo={photo}
        theme={theme}
        className="size-7 shrink-0 text-[11px]"
      />
      {/* As wide as the widest of the bubble and the line under it. The bubble
          keeps to the face's side; the line starts where the bubble does when
          the bubble is the wider, as a messenger lays them out. */}
      <div
        className={cn(
          'grid max-w-[80%] min-w-0',
          you ? 'justify-items-end' : 'justify-items-start',
        )}
      >
        <div
          className={cn(
            'min-h-7 max-w-full rounded-lg px-2.5 py-1.5',
            you
              ? 'bg-neutral-900 text-neutral-50 dark:bg-neutral-100 dark:text-neutral-950'
              : // A step off the panel, which is itself the menu surface, so the
                // bubble shows on it in either theme.
                'bg-neutral-200/60 text-neutral-950 dark:bg-neutral-700/60 dark:text-neutral-50',
          )}
        >
          <CommentBody body={comment.body} mentions={comment.mentions} />
        </div>
        <div
          className={cn(
            'mt-0.5 flex min-h-6 max-w-full items-center gap-1 justify-self-start text-[11px]',
            mutedText,
          )}
        >
          {!you && (
            <>
              <span className="truncate font-medium">{name}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          <time className="shrink-0" title={fullDateTime(comment.createdAt)}>
            {relativeTime(comment.createdAt)}
            {comment.editedAt !== null && <span className="italic"> · edited</span>}
          </time>
          <CommentActions
            name={name}
            canReact={canReact && !you}
            onReact={onReact}
            onReply={onReply}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
        <CommentReactions
          reactions={comment.reactions}
          userId={userId}
          canReact={canReact}
          onToggle={onReact}
          align={you ? 'end' : 'start'}
        />
      </div>
    </article>
  );
}

/**
 * What can be done to one comment, after its time, shown while it is pointed
 * at or has the focus. On someone else's: give an emoji, and answer them. On
 * your own: the three dots, which open a small bubble holding Edit and Delete.
 *
 * Held in place while the picker or the bubble is open, so what they hang from
 * does not vanish under them. Its room is kept while hidden, so the line does
 * not move when it appears.
 */
function CommentActions({
  name,
  canReact,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: {
  /** Whose comment, for what Reply says to a screen reader. */
  name: string;
  canReact: boolean;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { container } = useCommentEnvironment();
  const [open, setOpen] = useState(false);
  if (!canReact && !onReply && !onEdit && !onDelete) return null;

  return (
    <div
      role="toolbar"
      aria-label="Comment actions"
      className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/card:opacity-100 group-hover/card:opacity-100 has-[[data-state=open]]:opacity-100"
      data-testid="comment-actions"
    >
      {canReact && <EmojiPopover label="Add reaction" onPick={onReact} testId="comment-react" />}
      {onReply && (
        <button
          type="button"
          aria-label={`Reply to ${name}`}
          title="Reply"
          className={actionButton}
          onClick={onReply}
          data-testid="comment-reply"
        >
          <Reply aria-hidden="true" />
        </button>
      )}
      {(onEdit || onDelete) && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              title="More actions"
              className={actionButton}
              data-testid="comment-more"
            >
              <Ellipsis aria-hidden="true" />
            </button>
          </PopoverTrigger>
          {/* Beside the dots, on their line, rather than over the next comment;
              lifted off the panel it shares a surface with. */}
          <PopoverContent
            container={container}
            side="right"
            align="center"
            sideOffset={4}
            collisionPadding={8}
            className={cn(
              menuSurfaceClasses,
              'flex w-auto gap-0.5 p-0.5 shadow-md data-[state=open]:animate-none',
            )}
            // Part of the thread it opened from: a press in here is not a
            // press away from the thread.
            data-comment-panel
            data-comment-popup
          >
            {onEdit && (
              <button
                type="button"
                aria-label="Edit"
                title="Edit"
                className={cn(actionButton, 'text-neutral-700 dark:text-neutral-200')}
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                data-testid="comment-edit"
              >
                <Pencil aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label="Delete"
                title="Delete"
                // Red in both themes: the muted grey's dark variant would
                // otherwise outrank the danger red, which has none.
                className={cn(
                  actionButton,
                  menuDangerButtonClasses,
                  'dark:text-red-400 dark:hover:text-red-400',
                )}
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                data-testid="comment-delete"
              >
                <Trash2 aria-hidden="true" />
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function HeaderButton({
  label,
  onClick,
  testId,
  children,
}: {
  label: string;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'grid size-6 place-items-center rounded-md hover:bg-neutral-950/10 dark:hover:bg-neutral-50/10 [&_svg]:size-3.5',
        mutedText,
        'hover:text-neutral-950 dark:hover:text-neutral-50',
        focusRing,
      )}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
