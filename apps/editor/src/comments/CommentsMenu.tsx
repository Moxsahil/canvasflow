import { useRef, useState } from 'react';
import { ChevronDown, MessageSquare, X } from 'lucide-react';
import type { PresenceTheme } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import {
  InlineDropdownMenu,
  InlineDropdownMenuChoiceItem,
  InlineDropdownMenuContent,
  InlineDropdownMenuRadioGroup,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommentAvatar } from './CommentAvatar';
import {
  COMMENT_LIST_FILTERS,
  commentListCounts,
  commentSnippet,
  lastActivity,
  listedThreads,
  type CommentListFilter,
} from './comment-list';
import type { CommentThread } from './comment-model';
import { fullDateTime, relativeTime } from './comment-time';

interface CommentsMenuProps {
  threads: readonly CommentThread[];
  photos: Readonly<Record<string, string>>;
  theme: PresenceTheme;
  /** The thread open on the board, marked in the list. */
  openThreadId: string | null;
  /** A thread was picked: show it on the board. */
  onSelect: (thread: CommentThread) => void;
  /** The editor root, which the list portals into for its theme. */
  container: HTMLElement | null;
}

const mutedText = 'text-neutral-500 dark:text-neutral-400';
const washOnHover = 'hover:bg-neutral-950/10 dark:hover:bg-neutral-50/10';
const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-highlight-color)';

/**
 * The comments button, beside search, and the list it opens: every thread on
 * the board, wherever on it the thread is.
 *
 * The board shows a comment where it was left, which is no help in finding one
 * left somewhere else. Picking a thread here closes the list and brings the
 * board to it.
 */
export function CommentsMenu({
  threads,
  photos,
  theme,
  openThreadId,
  onSelect,
  container,
}: CommentsMenuProps) {
  const [open, setOpen] = useState(false);
  // Kept while the list is shut, so it reopens on what was being looked at.
  const [filter, setFilter] = useState<CommentListFilter>('open');
  const button = useRef<HTMLButtonElement>(null);
  const [overhang, setOverhang] = useState(0);

  const waiting = commentListCounts(threads).open;
  const label =
    waiting === 0
      ? 'Comments'
      : `Comments, ${waiting} open ${waiting === 1 ? 'thread' : 'threads'}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // The list hangs from the end of the row this button stands in, not
        // from the button: how far the row runs on past it is measured as the
        // list opens, since the row's other buttons come and go.
        const row = button.current?.parentElement;
        if (next && button.current && row) {
          setOverhang(
            row.getBoundingClientRect().right - button.current.getBoundingClientRect().right,
          );
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={button}
          type="button"
          aria-label={label}
          title="Comments"
          // The search button's build, which it stands beside.
          className="relative flex size-9 items-center justify-center rounded-full border border-(--default-border-color) bg-(--island-bg-color) text-(--icon-fill-color) transition-colors hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none data-[state=open]:bg-(--button-hover-bg)"
          data-testid="comments-button"
        >
          <MessageSquare className="size-4" aria-hidden="true" />
          {waiting > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-(--color-primary) px-1 text-[10px] leading-none font-semibold text-(--color-primary-foreground) tabular-nums"
              data-testid="comments-count"
            >
              {waiting > 99 ? '99+' : waiting}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        align="end"
        alignOffset={-overhang}
        sideOffset={8}
        collisionPadding={8}
        aria-label="Comments"
        className={cn(menuSurfaceClasses, 'w-75 p-0 shadow-none data-[state=open]:animate-none')}
        // Keys pressed in here are the list's: a letter typed over a row must
        // not pick up a tool on the board behind.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') event.stopPropagation();
        }}
      >
        <CommentsList
          threads={threads}
          photos={photos}
          theme={theme}
          openThreadId={openThreadId}
          filter={filter}
          onFilter={setFilter}
          container={container}
          onSelect={(thread) => {
            setOpen(false);
            onSelect(thread);
          }}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The list itself: one menu saying which threads, and a row a thread. Apart
 * from the popover that holds it, so it can be drawn and read on its own.
 */
export function CommentsList({
  threads,
  photos,
  theme,
  openThreadId,
  filter,
  onFilter,
  container,
  onSelect,
  onClose,
}: CommentsMenuProps & {
  filter: CommentListFilter;
  onFilter: (filter: CommentListFilter) => void;
  onClose: () => void;
}) {
  const counts = commentListCounts(threads);
  const listed = listedThreads(threads, filter);
  const showing = COMMENT_LIST_FILTERS.find(({ id }) => id === filter)!;

  return (
    <div className="flex flex-col text-xs" data-testid="comments-list">
      <div className="flex h-9 shrink-0 items-center justify-between px-1.5">
        <InlineDropdownMenu>
          <InlineDropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-6 items-center gap-1.5 rounded-md px-1.5 font-medium data-[state=open]:bg-neutral-950/10 dark:data-[state=open]:bg-neutral-50/10 [&[data-state=open]>svg]:rotate-180',
                washOnHover,
                focusRing,
              )}
              data-testid="comments-filter"
            >
              {`${showing.label} comments`}
              <span className={cn('font-normal tabular-nums', mutedText)}>{counts[filter]}</span>
              <ChevronDown
                aria-hidden="true"
                className={cn('size-3.5 transition-transform duration-200', mutedText)}
              />
            </button>
          </InlineDropdownMenuTrigger>
          <InlineDropdownMenuContent
            align="start"
            sideOffset={4}
            collisionPadding={8}
            container={container}
            className="min-w-40"
          >
            <InlineDropdownMenuRadioGroup
              value={filter}
              onValueChange={(value) => onFilter(value as CommentListFilter)}
            >
              {COMMENT_LIST_FILTERS.map(({ id, label }) => (
                <InlineDropdownMenuChoiceItem
                  key={id}
                  value={id}
                  data-testid={`comments-filter-${id}`}
                >
                  {label} <span className={cn('tabular-nums', mutedText)}>{counts[id]}</span>
                </InlineDropdownMenuChoiceItem>
              ))}
            </InlineDropdownMenuRadioGroup>
          </InlineDropdownMenuContent>
        </InlineDropdownMenu>
        <button
          type="button"
          aria-label="Close comments"
          title="Close"
          className={cn(
            'grid size-6 place-items-center rounded-md hover:text-neutral-950 dark:hover:text-neutral-50 [&_svg]:size-3.5',
            washOnHover,
            mutedText,
            focusRing,
          )}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>

      {/* As tall as what it holds, up to the point where it scrolls: one thread
          is one row, with no room left under it for threads that are not there. */}
      <div className="flex max-h-88 flex-col overflow-y-auto p-1 pt-0">
        {listed.length === 0 ? (
          <EmptyList filter={filter} any={threads.length > 0} />
        ) : (
          listed.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              photo={photos[thread.comments[0]!.authorId]}
              theme={theme}
              current={thread.id === openThreadId}
              onSelect={() => onSelect(thread)}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** One thread in the list: who started it, how much followed, and how it opens. */
function ThreadRow({
  thread,
  photo,
  theme,
  current,
  onSelect,
}: {
  thread: CommentThread;
  photo?: string;
  theme: PresenceTheme;
  current: boolean;
  onSelect: () => void;
}) {
  const first = thread.comments[0]!;
  const name = first.authorName || 'Someone';
  const replies = thread.comments.length - 1;
  const active = lastActivity(thread);
  const after = thread.resolved
    ? 'Resolved'
    : replies === 0
      ? null
      : replies === 1
        ? '1 reply'
        : `${replies} replies`;

  return (
    <button
      type="button"
      aria-current={current || undefined}
      className={cn(
        'flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-950/5 dark:hover:bg-neutral-50/5',
        current && 'bg-neutral-950/5 dark:bg-neutral-50/5',
        focusRing,
      )}
      onClick={onSelect}
      data-testid="comments-row"
      data-thread-id={thread.id}
    >
      <CommentAvatar
        userId={first.authorId}
        name={name}
        photo={photo}
        theme={theme}
        className="mt-0.5 size-[22px] text-[11px]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate font-medium">{name}</span>
          <time className={cn('shrink-0', mutedText)} title={fullDateTime(active)}>
            {relativeTime(active)}
          </time>
          {after && <span className={cn('ml-auto shrink-0 pl-2', mutedText)}>{after}</span>}
        </span>
        <span className="truncate">{commentSnippet(first.body)}</span>
      </span>
    </button>
  );
}

function EmptyList({ filter, any }: { filter: CommentListFilter; any: boolean }) {
  const [title, hint] = !any
    ? ['No comments yet', 'Press M and click the board to leave one.']
    : filter === 'open'
      ? ['No open comments', 'Every thread has been resolved.']
      : ['Nothing resolved yet', 'Resolved threads are kept here.'];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 py-6 text-center">
      <MessageSquare aria-hidden="true" className={cn('mb-1 size-5', mutedText)} />
      <p className="m-0 font-medium">{title}</p>
      <p className={cn('m-0', mutedText)}>{hint}</p>
    </div>
  );
}
