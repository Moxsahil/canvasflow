import { SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CommentReaction } from './comment-model';
import { EmojiPopover } from './EmojiPicker';

/** "Ada", "Ada and Grace", "Ada, Grace and Linus". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The emoji left on a comment: one chip an emoji, with how many gave it, and a
 * button to give one.
 *
 * A chip is pressed in for an emoji this person gave, and pressing it takes
 * theirs back — or adds theirs to someone else's. With nothing given yet the
 * button stands alone under the comment, where the first chip will go.
 */
export function CommentReactions({
  reactions,
  userId,
  canReact,
  onToggle,
}: {
  reactions: readonly CommentReaction[];
  userId: string | null;
  /** Off, the chips can be read and not pressed, and there is no button. */
  canReact: boolean;
  onToggle: (emoji: string) => void;
}) {
  const add = canReact ? (
    <EmojiPopover label="Add reaction" onPick={onToggle} testId="comment-react">
      <SmilePlus aria-hidden="true" />
    </EmojiPopover>
  ) : null;

  if (reactions.length === 0) return add ? <div className="mt-0.5 -ml-1 flex">{add}</div> : null;

  return (
    <div className="mt-1.5 flex items-start gap-1" data-testid="comment-reactions">
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
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
      {add}
    </div>
  );
}
