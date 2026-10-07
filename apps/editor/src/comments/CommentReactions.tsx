import { cn } from '@/lib/utils';
import type { CommentReaction } from './comment-model';

/** "Ada", "Ada and Grace", "Ada, Grace and Linus". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The emoji left on a comment: one chip an emoji, with how many gave it.
 *
 * A chip is pressed in for an emoji this person gave, and pressing it takes
 * theirs back — or adds theirs to someone else's. A new one is given from the
 * comment's own actions, so nothing shows here until somebody has.
 */
export function CommentReactions({
  reactions,
  userId,
  canReact,
  onToggle,
  align = 'start',
}: {
  reactions: readonly CommentReaction[];
  userId: string | null;
  /** Off, the chips can be read and not pressed. */
  canReact: boolean;
  onToggle: (emoji: string) => void;
  /** Which side of the comment they hang from: under your own, on the right. */
  align?: 'start' | 'end';
}) {
  if (reactions.length === 0) return null;

  return (
    <div
      className={cn('mt-1.5 flex flex-wrap gap-1', align === 'end' && 'justify-end')}
      data-testid="comment-reactions"
    >
      {reactions.map(({ emoji, by }) => {
        const mine = by.some((person) => person.id === userId);
        const who = listed(
          by.map((person) => (person.id === userId ? 'You' : person.name || 'Someone')),
        );
        return (
          <button
            key={emoji}
            type="button"
            aria-pressed={mine}
            aria-label={`${emoji} ${by.length}, from ${who}`}
            title={who}
            disabled={!canReact}
            className={cn(
              'flex h-6 items-center gap-1 rounded-md border px-1.5 tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) disabled:cursor-default',
              mine
                ? 'border-(--color-primary) bg-(--color-primary)/15 dark:bg-(--color-primary)/30'
                : 'border-neutral-300 enabled:hover:bg-neutral-950/10 dark:border-neutral-600 dark:enabled:hover:bg-neutral-50/10',
            )}
            onClick={() => onToggle(emoji)}
            data-testid="comment-reaction"
          >
            <span className="text-sm leading-none">{emoji}</span>
            {by.length}
          </button>
        );
      })}
    </div>
  );
}
