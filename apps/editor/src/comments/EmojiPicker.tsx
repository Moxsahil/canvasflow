import { useState, type ReactNode } from 'react';
import { Search, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCommentEnvironment } from './comment-environment';
import { searchEmoji } from './emoji-data';

const mutedText = 'text-neutral-500 dark:text-neutral-400';

/**
 * A grid of emoji to pick one from, with a field to find one by name.
 *
 * The same grid is what a comment's text takes an emoji from and what a
 * reaction is chosen in.
 */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState('');
  const groups = searchEmoji(query);

  return (
    <div className="flex w-64 flex-col text-xs" data-testid="emoji-picker">
      <label className="m-2 mb-1 flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-neutral-950/5 px-2 focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-(--focus-highlight-color) dark:bg-neutral-50/5">
        <Search aria-hidden="true" className={cn('size-3.5 shrink-0', mutedText)} />
        <input
          type="search"
          value={query}
          placeholder="Search emoji"
          aria-label="Search emoji"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400 [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="max-h-56 overflow-y-auto px-2 pb-2">
        {groups.length === 0 ? (
          <p className={cn('m-0 px-1 py-5 text-center', mutedText)}>No emoji by that name</p>
        ) : (
          groups.map((group) => (
            <section key={group.id} aria-label={group.label}>
              <h3 className={cn('m-0 px-1 pt-1.5 pb-1 text-[11px] font-medium', mutedText)}>
                {group.label}
              </h3>
              <div className="grid grid-cols-8">
                {group.emoji.map(([char, name]) => (
                  <button
                    key={char}
                    type="button"
                    aria-label={name}
                    title={name}
                    className="grid size-[30px] place-items-center rounded-md text-[17px] leading-none outline-none hover:bg-neutral-950/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--focus-highlight-color) dark:hover:bg-neutral-50/10"
                    onClick={() => onPick(char)}
                    data-emoji={char}
                  >
                    {char}
                  </button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * A button that opens the picker over whatever it stands in, and closes it on
 * a pick.
 */
export function EmojiPopover({
  label,
  onPick,
  onClosed,
  sideOffset = 6,
  className,
  testId,
  children,
}: {
  /** What the button does: "Add emoji", "Add reaction". */
  label: string;
  onPick: (emoji: string) => void;
  /** The picker has shut, and focus is this caller's to place. Left out, it returns to the button. */
  onClosed?: () => void;
  /** How far above the button the picker stands. */
  sideOffset?: number;
  className?: string;
  testId?: string;
  /** The button's face, in place of the usual smiley. */
  children?: ReactNode;
}) {
  const { container } = useCommentEnvironment();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-md outline-none hover:bg-neutral-950/10 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) data-[state=open]:bg-neutral-950/10 data-[state=open]:text-neutral-950 dark:hover:bg-neutral-50/10 dark:hover:text-neutral-50 dark:data-[state=open]:bg-neutral-50/10 dark:data-[state=open]:text-neutral-50 [&_svg]:size-3.5',
            mutedText,
            className,
          )}
          data-testid={testId}
        >
          {children ?? <Smile aria-hidden="true" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        side="top"
        align="start"
        sideOffset={sideOffset}
        collisionPadding={8}
        aria-label={label}
        className={cn(menuSurfaceClasses, 'w-auto p-0 shadow-none data-[state=open]:animate-none')}
        // Part of the thread it opened from: a press in here is not a press
        // away from the thread, and Escape in here closes this and not that.
        data-comment-panel
        data-comment-popup
        // Keys pressed in here are the picker's: a letter typed over the grid
        // must not pick up a tool on the board behind.
        onKeyDown={(event) => {
          if (event.key !== 'Escape') event.stopPropagation();
        }}
        onCloseAutoFocus={(event) => {
          if (!onClosed) return;
          event.preventDefault();
          onClosed();
        }}
      >
        <EmojiPicker
          onPick={(emoji) => {
            onPick(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
