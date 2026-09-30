import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import type { PresenceTheme } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { CommentAvatar } from './CommentAvatar';
import { CommentBody } from './CommentBody';
import { CommentComposer } from './CommentComposer';
import { CommentReactions } from './CommentReactions';
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
  const [reply, setReply] = useState(() => commentDraft(thread.id));
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
    clearCommentDraft(thread.id);
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
              actions={
                canComment && canEditComment(comment, userId) ? (
                  <>
                    <CardButton
                      label="Edit"
                      onClick={() => setEditing({ id: comment.id, body: comment.body })}
                    >
                      <Pencil aria-hidden="true" />
                    </CardButton>
                    <CardButton label="Delete" onClick={() => onDeleteComment(comment.id)}>
                      <Trash2 aria-hidden="true" />
                    </CardButton>
                  </>
                ) : null
              }
            />
          ),
        )}
      </div>

      {canComment && user && !resolved && (
        <CommentComposer
          className={cn('border-t px-3 py-2', hairline)}
          value={reply}
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

/** One comment: who, when, what they said, and what others made of it. */
function CommentCard({
  comment,
  photo,
  theme,
  userId,
  canReact,
  onReact,
  actions,
}: {
  comment: Comment;
  photo?: string;
  theme: PresenceTheme;
  /** Whoever is looking. */
  userId: string | null;
  canReact: boolean;
  onReact: (emoji: string) => void;
  actions: ReactNode;
}) {
  const name = comment.authorName || 'Someone';
  const you = comment.authorId === userId;
  return (
    <article
      className="group/card relative flex gap-2 px-3 py-2"
      data-testid="comment-card"
      data-comment-id={comment.id}
    >
      <CommentAvatar
        userId={comment.authorId}
        name={name}
        photo={photo}
        theme={theme}
        className="size-6 text-[11px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 items-center gap-1.5">
          <span className="truncate font-medium">{you ? `${name} (you)` : name}</span>
          <time className={cn('shrink-0', mutedText)} title={fullDateTime(comment.createdAt)}>
            {relativeTime(comment.createdAt)}
            {comment.editedAt !== null && <span className="italic"> · edited</span>}
          </time>
        </div>
        <CommentBody body={comment.body} mentions={comment.mentions} userId={userId} />
        <CommentReactions
          reactions={comment.reactions}
          userId={userId}
          canReact={canReact}
          onToggle={onReact}
        />
      </div>
      {actions && (
        <div
          className={cn(
            menuSurfaceClasses,
            'absolute top-1.5 right-2 flex gap-0.5 rounded-md p-0.5 opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100',
          )}
        >
          {actions}
        </div>
      )}
    </article>
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

function CardButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'grid size-5 place-items-center rounded hover:bg-neutral-950/10 dark:hover:bg-neutral-50/10 [&_svg]:size-3',
        focusRing,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
