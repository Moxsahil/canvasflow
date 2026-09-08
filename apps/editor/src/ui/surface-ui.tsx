import { Children, Fragment, forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The pieces a dialog on the app's own surface is built from.
 *
 * Every one of them reads `var(--surface-*)`, which the dialog shell declares
 * on its root — so nothing here takes a theme, and none of it works outside a
 * `SurfaceDialog`. See `ui/surface-palette` for the table itself.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_BASE =
  'flex shrink-0 items-center justify-center gap-[7px] rounded-[7px] px-[14px] py-[8px] text-[12px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--surface-accent)] text-[var(--surface-on-accent)] hover:bg-[var(--surface-accent-hover)] focus-visible:ring-[var(--surface-fg)]',
  secondary:
    'border border-[var(--surface-border)] bg-[var(--surface-raised)] text-[var(--surface-fg)] hover:bg-[var(--surface-raised-hover)] focus-visible:ring-[var(--surface-accent)]',
  ghost:
    'text-[var(--surface-fg-faint)] hover:text-[var(--surface-fg)] focus-visible:ring-[var(--surface-accent)]',
  // Outlined rather than filled: the design keeps a solid fill for the one
  // action it wants you to take, and destruction is never that.
  danger:
    'border border-[var(--surface-danger-border)] text-[var(--surface-danger)] hover:bg-[var(--surface-danger-wash)] focus-visible:ring-[var(--surface-danger)]',
};

interface SurfaceButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner and refuses clicks while some work is in flight. */
  loading?: boolean;
}

export const SurfaceButton = forwardRef<HTMLButtonElement, SurfaceButtonProps>(
  function SurfaceButton(
    {
      variant = 'secondary',
      loading = false,
      disabled,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}
        {...props}
      >
        {loading && <Spinner />}
        {children}
      </button>
    );
  },
);

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-[12px] shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
    />
  );
}

/** The heading above a card or a field — the design's only grouping device. */
export function SurfaceGroupLabel({
  children,
  htmlFor,
  id,
}: {
  children: ReactNode;
  htmlFor?: string;
  id?: string;
}) {
  const className = 'block w-full text-[12px] font-medium text-[var(--surface-fg-muted)]';
  return htmlFor ? (
    <label id={id} htmlFor={htmlFor} className={className}>
      {children}
    </label>
  ) : (
    <p id={id} className={className}>
      {children}
    </p>
  );
}

/**
 * A card of rows.
 *
 * Every card in the design puts a hairline between neighbouring rows and none
 * at its edges, so the separators are drawn here rather than typed out at every
 * call site — one fewer thing to get wrong when a row is added or moved.
 */
export function SurfaceCard({ children, className }: { children: ReactNode; className?: string }) {
  const rows = Children.toArray(children);
  return (
    <div
      className={cn(
        'flex w-full shrink-0 flex-col overflow-hidden rounded-[12px] border border-[var(--surface-border)] bg-[var(--surface-card)]',
        className,
      )}
    >
      {rows.map((row, index) => (
        // The rows of a card are written out literally and never reorder, so
        // their position is a stable identity.
        <Fragment key={index}>
          {index > 0 && <div className="h-px w-full shrink-0 bg-[var(--surface-border)]" />}
          {row}
        </Fragment>
      ))}
    </div>
  );
}

/** A row: something named on the left, something to do about it on the right. */
export function SurfaceRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex w-full items-center gap-[16px] px-[18px] py-[15px]', className)}>
      {children}
    </div>
  );
}

export function SurfaceRowText({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    // Nothing is truncated: a hint clipped to "The extension follows the f…"
    // is worse than one that wraps, and the row grows to fit it.
    <div className="flex min-w-0 flex-1 flex-col gap-[4px] pr-[8px]">
      <div className="text-[12.5px] font-medium text-[var(--surface-fg)]">{title}</div>
      {hint && <div className="text-[11px] text-[var(--surface-fg-faint)]">{hint}</div>}
    </div>
  );
}

/** A row whose right-hand side states a fact rather than offering a control. */
export function SurfaceValueText({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[12.5px] text-[var(--surface-fg)]">{children}</span>;
}

export const SURFACE_INPUT_CLASS =
  'w-full min-w-0 rounded-[7px] border border-[var(--surface-border)] bg-[var(--surface-input)] px-[10px] py-[8px] text-[12.5px] text-[var(--surface-fg)] placeholder:text-[var(--surface-fg-faint)] focus:border-[var(--surface-accent)] focus:outline-none disabled:opacity-50';

/** Hint and error text under a field. */
export function SurfaceHint({ children, tone }: { children: ReactNode; tone?: 'danger' }) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'text-[11px]',
        tone === 'danger' ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-faint)]',
      )}
    >
      {children}
    </p>
  );
}

/** The 34×20 switch, with its 16px knob 2px inside either end. */
export function SurfaceToggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:outline-none',
        on ? 'bg-[var(--surface-accent)]' : 'bg-[var(--surface-toggle-off)]',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] size-[16px] rounded-full bg-[var(--surface-on-accent)] transition-[left]',
          on ? 'left-[16px]' : 'left-[2px]',
        )}
      />
    </button>
  );
}

/** A 120px track with its reading beside it. */
export function SurfaceMeter({
  used,
  total,
  label,
}: {
  used: number;
  total: number;
  label: string;
}) {
  const ratio = total > 0 ? Math.min(Math.max(used / total, 0), 1) : 0;
  return (
    <div className="flex shrink-0 items-center gap-[12px]">
      <div
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="h-[5px] w-[120px] overflow-hidden rounded-full bg-[var(--surface-toggle-off)]"
      >
        <div
          style={{ width: `${ratio * 100}%` }}
          className="h-full rounded-full bg-[var(--surface-accent)]"
        />
      </div>
      <span className="text-[12.5px] text-[var(--surface-fg)]">{label}</span>
    </div>
  );
}
