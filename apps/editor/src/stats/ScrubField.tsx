import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import type { StatsValue } from './stats-ops';

/** The smallest change worth writing: the two decimals a field shows. */
const SMALLEST_CHANGE = 0.01;

const mutedText = 'text-neutral-500 dark:text-neutral-400';

interface ScrubFieldProps {
  /** Shown before the value — a letter, on a strip — and the handle it is dragged by. */
  label: string;
  /** What the field is, read out in full: "Width", where the label is "W". */
  name: string;
  value: StatsValue;
  /** Off, the value is shown and can be neither typed over nor dragged. */
  editable: boolean;
  /** A number was typed in and entered. */
  onSet: (value: number) => void;
  /** The field took focus: whatever is typed next is about what is selected now. */
  onFocus: () => void;
  onScrubStart: () => void;
  /** How far the label has been dragged since the drag began, in whole steps. */
  onScrub: (change: number, byStep: boolean) => void;
  onScrubEnd: () => void;
  /** Pixels of drag to one unit of change. */
  sensitivity?: number;
}

/**
 * One number, changed two ways: typed into the field, or dragged out of its
 * label — left for less, right for more, a unit a pixel.
 *
 * The field holds what is being typed until it is entered: Enter, leaving the
 * field, and a press anywhere else all enter it, and Escape puts back what was
 * there. Nothing is written for a number that is not one, or that says what
 * the field already said.
 */
export function ScrubField({
  label,
  name,
  value,
  editable,
  onSet,
  onFocus,
  onScrubStart,
  onScrub,
  onScrubEnd,
  sensitivity = 1,
}: ScrubFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(String(value));
  // Whether the field holds something typed and not yet entered.
  const pendingRef = useRef(false);
  // Bumped to put the true value back in the field after an edit that came to
  // nothing — a width below the smallest allowed reads that smallest, not what
  // was typed.
  const [settled, setSettled] = useState(0);

  useEffect(() => {
    setText(String(value));
    pendingRef.current = false;
  }, [value, settled]);

  // The latest of each, for the listeners below that outlive the render they
  // were made in.
  const latest = useRef({ value, onSet, onScrub, onScrubEnd });
  latest.current = { value, onSet, onScrub, onScrubEnd };

  const enter = (raw: string) => {
    if (!pendingRef.current) return;
    pendingRef.current = false;

    const typed = Number(raw);
    const current = Number(latest.current.value);
    if (raw.trim() !== '' && !Number.isNaN(typed)) {
      const next = Math.round(typed * 100) / 100;
      // "Mixed" is not a number, so any number typed over it is a change.
      if (Number.isNaN(current) || Math.abs(next - current) >= SMALLEST_CHANGE) {
        latest.current.onSet(next);
      }
    }
    setSettled((n) => n + 1);
  };
  const enterRef = useRef(enter);
  enterRef.current = enter;

  // A press on the board does not take focus from the field — the canvas keeps
  // the browser from moving it — so leaving this way has to be listened for.
  // Entered before the press is answered, while what was being edited is still
  // what is selected. Unmounting is the same case, with no press to hear: a
  // selection changed from the keyboard takes the field away mid-word.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!pendingRef.current && document.activeElement !== input) return;
      if (event.target instanceof Node && input.contains(event.target)) return;
      enterRef.current(input.value);
      input.blur();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      enterRef.current(input.value);
    };
    // Mounted and unmounted with being editable: a field that stops being one
    // has to enter what it held, and a disabled input never reports a blur.
  }, [editable]);

  const stopScrub = useRef<(() => void) | null>(null);
  useEffect(() => () => stopScrub.current?.(), []);

  const startScrub = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!editable || event.button !== 0) return;
    // Keeps the press from selecting text as it drags.
    event.preventDefault();
    inputRef.current?.blur();
    onScrubStart();

    let lastX = event.clientX;
    let pending = 0;
    let change = 0;

    const move = (moveEvent: PointerEvent) => {
      pending += moveEvent.clientX - lastX;
      lastX = moveEvent.clientX;
      if (Math.abs(pending) < sensitivity) return;

      // Whole steps are spent and the rest is kept: a pointer reports fractions
      // of a pixel on some screens, and dropping them each time would leave
      // the value trailing further behind the hand the longer the drag went on.
      const steps = Math.sign(pending) * Math.floor(Math.abs(pending) / sensitivity);
      change += steps;
      pending -= steps * sensitivity;
      latest.current.onScrub(change, moveEvent.shiftKey);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.classList.remove('cf-scrubbing');
      stopScrub.current = null;
      latest.current.onScrubEnd();
    };

    document.body.classList.add('cf-scrubbing');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    stopScrub.current = stop;
  };

  const testId = `stats-${name.toLowerCase().replace(/\s+/g, '-')}`;
  const isMixed = typeof value !== 'number';

  return (
    <div
      title={name}
      className={cn(
        'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5',
        editable &&
          'hover:bg-neutral-950/5 focus-within:bg-neutral-950/5 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-(--focus-highlight-color) dark:hover:bg-neutral-50/5 dark:focus-within:bg-neutral-50/5',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          mutedText,
          'touch-none text-[11px] font-semibold select-none',
          editable && 'cursor-ew-resize',
        )}
        title={editable ? `Drag to change the ${name.toLowerCase()}` : undefined}
        onPointerDown={startScrub}
      >
        {label}
      </span>
      {editable ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-label={name}
          value={text}
          // As wide as what it holds, so the strip is as long as its numbers
          // and no longer. A digit is one `ch` in tabular figures.
          style={{ width: `${Math.max(text.length, 1) + 0.5}ch` }}
          className={cn(
            'min-w-0 border-0 bg-transparent p-0 text-xs font-medium tabular-nums outline-none',
            isMixed && cn(mutedText, 'italic'),
          )}
          onChange={(event) => {
            pendingRef.current = true;
            setText(event.target.value);
          }}
          onFocus={(event) => {
            event.target.select();
            onFocus();
          }}
          onBlur={(event) => enter(event.target.value)}
          onKeyDown={(event) => {
            // Every key stays with the field: the same keys run the board's
            // shortcuts, and a digit typed here is not a tool being chosen.
            event.stopPropagation();
            if (event.key === 'Enter') {
              enter(event.currentTarget.value);
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              pendingRef.current = false;
              setSettled((n) => n + 1);
              event.currentTarget.blur();
            }
          }}
          data-testid={testId}
        />
      ) : (
        <output
          aria-label={name}
          className={cn(mutedText, 'text-xs font-medium tabular-nums', isMixed && 'italic')}
          data-testid={testId}
        >
          {value}
        </output>
      )}
    </div>
  );
}
