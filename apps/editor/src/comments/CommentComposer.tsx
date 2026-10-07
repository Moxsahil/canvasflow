import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { CommentAvatar } from './CommentAvatar';
import { useCommentEnvironment } from './comment-environment';
import { insertMention, mentionCandidates, mentionQueryAt, mentionsIn } from './comment-mentions';
import { isCommentEmpty, type CommentAuthor } from './comment-model';
import { EmojiPopover } from './EmojiPicker';

interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Enter, or the send button, with the people the comment names. Not called
   * for a comment that says nothing.
   */
  onSubmit: (mentions: CommentAuthor[]) => void;
  /** Escape. Where there is none, Escape is left to whatever is around the composer. */
  onCancel?: () => void;
  /** Up arrow in an empty composer: reach for the comment above, as a chat does. */
  onEditPrevious?: () => void;
  placeholder: string;
  /** What the send button says to a screen reader: "Post comment", "Save". */
  sendLabel: string;
  /** Shown before the field — the face of whoever is writing. */
  leading?: ReactNode;
  /**
   * People the text may already name who can no longer be picked from the
   * list: a comment being edited keeps its mention of someone who has left.
   */
  named?: readonly CommentAuthor[];
  autoFocus?: boolean;
  /**
   * Changes whenever something outside wants the caret here, at the end of
   * what is written — a reply to someone, which has just put their name in.
   */
  focusSignal?: number;
  className?: string;
}

/** Tall enough for a paragraph, and no taller: past this the field scrolls. */
const MAX_HEIGHT = 160;

/** The name being typed at the field's caret. A stretch of selected text is not a caret in a name. */
function mentionAtCaret(field: HTMLTextAreaElement) {
  return field.selectionStart === field.selectionEnd
    ? mentionQueryAt(field.value, field.selectionStart)
    : null;
}

const toolButton =
  'grid size-6 shrink-0 place-items-center rounded-md text-neutral-500 outline-none hover:bg-neutral-950/10 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) dark:text-neutral-400 dark:hover:bg-neutral-50/10 dark:hover:text-neutral-50 [&_svg]:size-3.5';

/**
 * Where a comment is written: a field that grows with what is typed, and under
 * it the things that can be put in — an emoji, a person — and the button that
 * sends it.
 *
 * Enter sends and Shift+Enter breaks the line, as in every chat — a comment is
 * usually a sentence, and reaching for the mouse to post one is a tax on the
 * common case.
 *
 * Typing an @ offers the people who can be named, narrowed by what follows it:
 * the start of their name, or of their username, shown beside it.
 * While that list is up the keys that would move the caret or send the comment
 * choose from it instead.
 */
export function CommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  onEditPrevious,
  placeholder,
  sendLabel,
  leading,
  named,
  autoFocus,
  focusSignal,
  className,
}: CommentComposerProps) {
  const { container, people, photos, theme } = useCommentEnvironment();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const empty = isCommentEmpty(value);

  // The name being typed at the caret, and which of the people offered for it
  // is marked.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [marked, setMarked] = useState(0);
  const offered = mention ? mentionCandidates(mention.query, people) : [];
  const offering = offered.length > 0;
  const current = Math.min(marked, offered.length - 1);

  // How tall the field stands, which is how far the emoji grid has to rise to
  // clear it: the grid opens from a button under the field, and must not sit
  // over the words the emoji is going into.
  const [fieldHeight, setFieldHeight] = useState(0);

  // Where the caret belongs after the text was changed from outside the field,
  // by a pick or a button. Set once the new text is in it.
  const caretAfter = useRef<number | null>(null);

  const readMention = () => {
    const field = fieldRef.current;
    if (!field) return;
    setMention(mentionAtCaret(field));
    setMarked(0);
  };

  // Sized to its content after every change. A textarea has no height of its
  // own to grow into.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, MAX_HEIGHT)}px`;
    setFieldHeight(field.offsetHeight);

    if (caretAfter.current !== null) {
      field.focus({ preventScroll: true });
      field.setSelectionRange(caretAfter.current, caretAfter.current);
      caretAfter.current = null;
      setMention(mentionAtCaret(field));
      setMarked(0);
    }
  }, [value]);

  // Focused by hand rather than by the attribute: the press that opened this
  // composer landed on the canvas, which keeps the browser from moving focus,
  // and the caret belongs at the end of a draft that was put back.
  useEffect(() => {
    const field = fieldRef.current;
    if (!autoFocus || !field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }, [autoFocus]);

  // Asked for from outside, after the text it asked about has landed.
  useEffect(() => {
    const field = fieldRef.current;
    if (!focusSignal || !field) return;
    field.focus({ preventScroll: true });
    field.setSelectionRange(field.value.length, field.value.length);
  }, [focusSignal]);

  /** Put text where the caret is, over whatever is selected. */
  const insert = (text: string) => {
    const field = fieldRef.current;
    const from = field?.selectionStart ?? value.length;
    const to = field?.selectionEnd ?? value.length;
    caretAfter.current = from + text.length;
    onChange(value.slice(0, from) + text + value.slice(to));
  };

  const pick = (person: CommentAuthor) => {
    const field = fieldRef.current;
    if (!mention || !field) return;
    const next = insertMention(value, mention.start, field.selectionStart, person);
    caretAfter.current = next.caret;
    setMention(null);
    onChange(next.text);
  };

  const submit = () => {
    if (empty) return;
    setMention(null);
    onSubmit(mentionsIn(value, [...people, ...(named ?? [])]));
  };

  return (
    <div className={cn('flex items-start gap-2', className)}>
      {leading}
      <Popover open={offering} onOpenChange={(open) => !open && setMention(null)}>
        <PopoverAnchor asChild>
          <div className="flex min-w-0 flex-1 flex-col rounded-lg bg-neutral-950/5 focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-(--focus-highlight-color) dark:bg-neutral-50/5">
            <textarea
              ref={fieldRef}
              rows={1}
              value={value}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-autocomplete="list"
              aria-controls={offering ? listId : undefined}
              aria-activedescendant={offering ? `${listId}-${current}` : undefined}
              className="min-w-0 resize-none border-0 bg-transparent px-2.5 pt-2 pb-1 text-xs leading-[1.4] outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
              onChange={(event) => {
                onChange(event.target.value);
                readMention();
              }}
              // The caret moved without the text changing: by a click, or by
              // an arrow key while no list was up to take it.
              onClick={readMention}
              onKeyUp={(event) => {
                if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
                  if (!offering) readMention();
                }
              }}
              onBlur={() => setMention(null)}
              onKeyDown={(event) => {
                // Every key stays here: the same keys choose tools and nudge
                // shapes on the board behind.
                event.stopPropagation();
                if (event.nativeEvent.isComposing) return;

                if (offering) {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const step = event.key === 'ArrowDown' ? 1 : -1;
                    setMarked((current + step + offered.length) % offered.length);
                    return;
                  }
                  if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault();
                    pick(offered[current]!);
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setMention(null);
                    return;
                  }
                }

                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                } else if (event.key === 'Escape' && onCancel) {
                  event.preventDefault();
                  onCancel();
                } else if (event.key === 'ArrowUp' && value === '' && onEditPrevious) {
                  event.preventDefault();
                  onEditPrevious();
                }
              }}
            />
            <div className="flex items-center gap-0.5 px-1 pb-1">
              <EmojiPopover
                label="Add emoji"
                sideOffset={fieldHeight + 6}
                onPick={insert}
                // Back to the field, where the emoji went, not to the button.
                onClosed={() => fieldRef.current?.focus({ preventScroll: true })}
                testId="comment-emoji"
              />
              <button
                type="button"
                aria-label="Mention someone"
                title="Mention someone"
                className={toolButton}
                // Kept from taking focus, so the caret is still where the @
                // is to go.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  const field = fieldRef.current;
                  const before = value.slice(0, field?.selectionStart ?? value.length);
                  // An @ starts a name only after a space or at the start.
                  insert(before === '' || /\s$/.test(before) ? '@' : ' @');
                }}
                data-testid="comment-mention"
              >
                <AtSign aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={sendLabel}
                title={sendLabel}
                disabled={empty}
                className="ml-auto grid size-6 shrink-0 place-items-center rounded-md bg-(--color-primary) text-(--color-primary-foreground) outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) disabled:bg-neutral-950/10 disabled:text-neutral-500 dark:disabled:bg-neutral-50/10 dark:disabled:text-neutral-400 [&_svg]:size-3.5"
                onClick={submit}
              >
                <ArrowUp aria-hidden="true" />
              </button>
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          container={container}
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          id={listId}
          role="listbox"
          aria-label="People to mention"
          className={cn(
            menuSurfaceClasses,
            'flex w-56 flex-col gap-y-0.5 p-1 text-xs shadow-none data-[state=open]:animate-none',
          )}
          // Part of the thread it opened from: a press in here is not a press
          // away from the thread.
          data-comment-panel
          data-comment-popup
          // The caret stays in the field, which is what is being typed in.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          // Escape is the field's to answer, where the caret is: answered here
          // as well, the list would be gone by the time the field heard the
          // key, and the field would take it for leaving the comment.
          onEscapeKeyDown={(event) => event.preventDefault()}
          // A press in the field is a press outside this list, and moving the
          // caret there is not a reason to put the list away.
          onInteractOutside={(event) => {
            if (event.target === fieldRef.current) event.preventDefault();
          }}
          data-testid="comment-mention-list"
        >
          {offered.map((person, index) => (
            <button
              key={person.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === current}
              tabIndex={-1}
              className={cn(
                'flex h-7 w-full items-center gap-2 rounded px-1.5 text-left outline-none',
                index === current && 'bg-neutral-950/10 dark:bg-neutral-50/10',
              )}
              // The field keeps the focus, and with it the caret the name goes at.
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => setMarked(index)}
              onClick={() => pick(person)}
              data-testid="comment-mention-option"
            >
              <CommentAvatar
                userId={person.id}
                name={person.name}
                photo={photos[person.id]}
                theme={theme}
                className="size-[18px] text-[9px]"
              />
              {/* The name keeps its width, up to most of the row, and the
                  username, muted, has what is left: the name is who they are,
                  the username how else to find them. */}
              <span className={cn('min-w-0 truncate', person.username && 'max-w-[60%] shrink-0')}>
                {person.name}
              </span>
              {person.username && (
                <span className="min-w-0 flex-1 truncate text-right text-neutral-500 dark:text-neutral-400">
                  @{person.username}
                </span>
              )}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
