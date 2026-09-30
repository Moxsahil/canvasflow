import { cn } from '@/lib/utils';
import { splitMentions } from './comment-mentions';
import type { CommentAuthor } from './comment-model';

/**
 * What a comment says, with the people it names marked out. A mention of
 * whoever is reading is marked more strongly than the rest: it is the one
 * addressed to them.
 */
export function CommentBody({
  body,
  mentions,
  userId,
}: {
  body: string;
  mentions: readonly CommentAuthor[];
  userId: string | null;
}) {
  return (
    // Selectable, unlike the rest of the board's chrome: a comment is
    // something people copy out of.
    <p className="m-0 leading-[1.4] break-words whitespace-pre-wrap select-text">
      {splitMentions(body, mentions).map((part, index) =>
        typeof part === 'string' ? (
          part
        ) : (
          <span
            key={index}
            className={cn(
              'rounded-sm px-0.5 font-medium',
              part.id === userId
                ? 'bg-(--color-primary)/20 dark:bg-(--color-primary)/35'
                : 'bg-neutral-950/10 dark:bg-neutral-50/10',
            )}
            data-mention={part.id}
          >
            @{part.name}
          </span>
        ),
      )}
    </p>
  );
}
