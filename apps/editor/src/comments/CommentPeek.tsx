import { cn } from '@/lib/utils';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { lastActivity } from './comment-list';
import type { CommentThread } from './comment-model';
import { relativeTime } from './comment-time';

/** The card's width, which its place beside the pin is worked out from. */
export const PEEK_WIDTH = 214;

/**
 * A thread in short, shown while its pin is pointed at: who started it, when
 * it last moved, how it opens, and how much followed.
 *
 * The board carries a face for each thread and nothing else. This is what
 * makes a face readable without opening it.
 */
export function CommentPeek({ thread, id }: { thread: CommentThread; id?: string }) {
  const first = thread.comments[0]!;
  const replies = thread.comments.length - 1;
  const after = thread.resolved
    ? 'Resolved'
    : replies === 0
      ? null
      : replies === 1
        ? '1 reply'
        : `${replies} replies`;

  return (
    <div
      id={id}
      role="tooltip"
      className={cn(menuSurfaceClasses, 'rounded-[10px] px-2.5 py-2 text-xs')}
      style={{ width: PEEK_WIDTH }}
      data-testid="comment-peek"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="truncate font-medium">{first.authorName || 'Someone'}</span>
        <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
          {relativeTime(lastActivity(thread))}
        </span>
      </div>
      <p className="m-0 mt-0.5 line-clamp-2 leading-[1.4] break-words">{first.body}</p>
      {after && <p className="m-0 mt-1 text-neutral-500 dark:text-neutral-400">{after}</p>}
    </div>
  );
}
