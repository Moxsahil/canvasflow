import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  menuLabelClasses,
  menuSeparatorClasses,
  menuSurfaceClasses,
} from '@/components/ui/menu-look';

/**
 * The style panel's building blocks: labelled rows with one control each,
 * value on the right — the row anatomy the editor's menus use, turned into an
 * inspector.
 */

const mutedText = 'text-neutral-500 dark:text-neutral-400';

/** The well a control sits in: a faint tint of the panel's own ink. */
const wellClasses = 'bg-neutral-950/5 dark:bg-neutral-50/5';
const wellHoverClasses = 'hover:bg-neutral-950/10 dark:hover:bg-neutral-50/10';
const wellOpenClasses = 'bg-neutral-950/10 dark:bg-neutral-50/10';

const focusRing =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color)';

/** Every control in the value column is this wide, so their edges line up. */
const valueWidth = 'w-30';

export function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-y-0.5">
      <h3 className={cn(menuLabelClasses, 'm-0 font-normal')}>{title}</h3>
      {children}
    </section>
  );
}

export function InspectorDivider() {
  return <div role="separator" className={cn(menuSeparatorClasses, 'my-1')} />;
}

/** A property: its name on the left, its one control on the right. */
export function InspectorRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 px-2">
      <span className={mutedText}>{label}</span>
      {children}
    </div>
  );
}

export interface SegmentOption<T> {
  value: T;
  label: string;
  icon: ReactNode;
}

/**
 * A set of choices in one well, with a thumb that slides to the one in effect.
 *
 * A radio group underneath: one stop in the tab order, arrow keys to move
 * through it. The arrows are kept from reaching the board, where the same keys
 * nudge the selection this panel is editing.
 *
 * With nothing matching — a selection mixing two values — no thumb is drawn,
 * rather than one parked on a choice that isn't true.
 */
export function SegmentedControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  mirrored,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  /** Flip the glyphs, for markers that point the other way. */
  mirrored?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = options.findIndex((option) => option.value === value);
  const count = options.length;

  const move = (to: number) => {
    const next = (to + count) % count;
    onChange(options[next]!.value);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('relative grid h-6.5 shrink-0 rounded-md p-0.5', valueWidth, wellClasses)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {index >= 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0.5 rounded-sm bg-white shadow-[0_0_0_1px_#d4d4d4,0_1px_2px_rgb(0_0_0/0.12)] transition-transform duration-200 ease-[cubic-bezier(0.3,0.7,0.2,1)] motion-reduce:transition-none dark:bg-neutral-700 dark:shadow-[0_0_0_1px_#525252]"
          style={{
            width: `calc((100% - 4px) / ${count})`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      )}
      {options.map((option, i) => {
        const checked = i === index;
        return (
          <button
            key={String(option.value)}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            // One stop in the tab order: the choice in effect, or the first.
            tabIndex={i === Math.max(index, 0) ? 0 : -1}
            className={cn(
              'relative z-10 grid place-items-center rounded-sm text-xs font-medium [&_svg]:size-4',
              focusRing,
              checked
                ? 'text-neutral-950 dark:text-neutral-50'
                : cn(mutedText, 'hover:text-neutral-950 dark:hover:text-neutral-50'),
              mirrored && '[&_svg]:-scale-x-100',
            )}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                move(i + 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                move(i - 1);
              }
            }}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}

/** A colour square: the paint it names, or a checkerboard for none. */
export function Swatch({
  value,
  paint,
  className,
}: {
  value: string | null;
  paint: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'shrink-0 shadow-[inset_0_0_0_1px_rgb(128_128_128/0.35)]',
        value === null && 'cf-transparent-swatch',
        className,
      )}
      style={value === null || paint === null ? undefined : { backgroundColor: paint }}
    />
  );
}

const chipClasses = cn(
  'inline-flex h-6 shrink-0 items-center gap-2 rounded-[5px] px-1.5 text-left text-xs font-medium tabular-nums',
  valueWidth,
  wellClasses,
  wellHoverClasses,
  focusRing,
);

/**
 * A colour in effect, as a square and its code. Opens the picker, which
 * carries the quick picks as well as the wheel.
 */
export function ColorChip({
  label,
  value,
  paint = (colour) => colour,
  expanded,
  onOpen,
}: {
  label: string;
  value: string | null;
  /** How the board paints the colour, when that differs from the stored one. */
  paint?: (value: string) => string;
  expanded: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${value ?? 'none'}`}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className={cn(chipClasses, expanded && wellOpenClasses)}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <Swatch
        value={value}
        paint={value ? paint(value) : null}
        className="size-3.5 rounded-[3px]"
      />
      <span className="truncate">{value === null ? 'None' : value.toUpperCase()}</span>
    </button>
  );
}

/** A choice from a set too long for a segmented control, opened as a small grid. */
export function ChoiceChip({
  label,
  valueLabel,
  icon,
  mirrored,
  expanded,
  onOpen,
}: {
  label: string;
  valueLabel: string;
  icon: ReactNode;
  mirrored?: boolean;
  expanded: boolean;
  onOpen: (trigger: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`${label}: ${valueLabel}`}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      className={cn(chipClasses, expanded && wellOpenClasses)}
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <span
        className={cn(
          'grid shrink-0 place-items-center [&_svg]:size-4',
          mirrored && '[&_svg]:-scale-x-100',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{valueLabel}</span>
      <ChevronDown aria-hidden="true" className={cn('size-3 shrink-0', mutedText)} />
    </button>
  );
}

/** Steps through a short ladder of values, showing the one in effect. */
export function StepperControl<T extends number>({
  label,
  value,
  steps,
  format,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  label: string;
  value: T;
  steps: readonly T[];
  format: (value: T) => string;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (value: T) => void;
}) {
  // A value off the ladder steps from the nearest rung.
  const exact = steps.indexOf(value);
  const index =
    exact >= 0
      ? exact
      : steps.reduce(
          (best, step, i) => (Math.abs(step - value) < Math.abs(steps[best]! - value) ? i : best),
          0,
        );
  const buttonClasses = cn(
    'grid h-6 w-6 place-items-center rounded-[5px] disabled:opacity-30 [&_svg]:size-3',
    wellHoverClasses,
    focusRing,
  );

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex h-6 shrink-0 items-center justify-between rounded-[5px]',
        valueWidth,
        wellClasses,
      )}
    >
      <button
        type="button"
        aria-label={decreaseLabel}
        title={decreaseLabel}
        disabled={index <= 0}
        className={buttonClasses}
        onClick={() => onChange(steps[index - 1]!)}
      >
        <Minus aria-hidden="true" />
      </button>
      <span aria-live="polite" className="text-xs font-medium tabular-nums">
        {format(value)}
      </span>
      <button
        type="button"
        aria-label={increaseLabel}
        title={increaseLabel}
        disabled={index >= steps.length - 1}
        className={buttonClasses}
        onClick={() => onChange(steps[index + 1]!)}
      >
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}

const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * For a slider's `onKeyDown`: the keys that step it stay with it. Left to
 * reach the board, the arrows would nudge the selection instead and the
 * slider wouldn't move.
 */
export function keepSliderKeys(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (SLIDER_KEYS.has(event.key)) event.stopPropagation();
}

/** A 0–100 range with the value read out beside it; the track fills up to it. */
export function PercentControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2', valueWidth)}>
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={value}
        aria-label={label}
        className={cn('cf-inspector-range min-w-0 flex-1', focusRing)}
        style={{ '--fill': `${value}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
        onKeyDown={keepSliderKeys}
      />
      <span className="w-8 text-right text-xs font-medium tabular-nums">{value}%</span>
    </div>
  );
}

export function InspectorIconButton({
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
        'grid h-6 w-6 place-items-center rounded-[5px] [&_svg]:size-3.5',
        wellHoverClasses,
        focusRing,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The popover a chip opens, absolutely placed inside whatever holds the chip:
 * beside the docked panel, or above or below the floating bar. The caller
 * says where, since only it knows which side has room.
 *
 * Escape and a press anywhere else close it — the chip that opened it
 * excepted, which toggles it instead of closing it and opening it again.
 */
export function InspectorPopover({
  title,
  position,
  trigger,
  onClose,
  className,
  children,
}: {
  title: string;
  /** Offsets within the popover's containing block. */
  position: CSSProperties;
  trigger: HTMLElement;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        trigger.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      const target = event.target as Node;
      if (!root || root.contains(target) || trigger.contains(target)) return;
      onClose();
    };
    // Capture phase: the canvas suppresses default pointer handling, so a press
    // on it would never reach a bubbling listener.
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose, trigger]);

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={title}
      className={cn(
        menuSurfaceClasses,
        'absolute z-(--zIndex-popup) flex flex-col text-xs',
        className,
      )}
      style={position}
    >
      <p className={cn(menuLabelClasses, 'm-0')}>{title}</p>
      {children}
    </div>
  );
}

/**
 * One choice in a popover's grid. A colour is marked with a ring, which keeps
 * the colour itself unobscured; a glyph is marked by lighting its cell.
 */
export function PickerCell({
  label,
  selected,
  onPick,
  variant,
  className,
  style,
  children,
}: {
  label: string;
  selected: boolean;
  onPick: () => void;
  variant: 'colour' | 'glyph';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={cn(
        'grid place-items-center rounded-[5px]',
        focusRing,
        variant === 'glyph' && cn('h-8 [&_svg]:size-5', wellHoverClasses),
        variant === 'glyph' && selected && wellOpenClasses,
        variant === 'colour' &&
          selected &&
          'shadow-[0_0_0_2px_#fafafa,0_0_0_3.5px_#0a0a0a] dark:shadow-[0_0_0_2px_oklch(26.9%_0_none),0_0_0_3.5px_#fafafa]',
        className,
      )}
      style={style}
      onClick={onPick}
    >
      {children}
    </button>
  );
}
