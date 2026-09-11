import { Children, Fragment, type ReactNode } from 'react';

/**
 * The pieces every pane is built from.
 *
 * The six panes are one design: a header, a body of labelled cards, and the
 * same footer. Only the rows differ, so the chrome lives here once and a pane
 * is little more than its content.
 */

interface SettingsPaneProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  /**
   * Persist what the pane is holding.
   *
   * Optional because most panes still have nothing behind them: without it the
   * footer button closes, which is what it has always done. A pane that can
   * save passes this and decides for itself whether to close afterwards.
   */
  onSave?: () => void;
  saving?: boolean;
  /** Replaces the footer's usual line while something is wrong. */
  error?: string | null;
  children: ReactNode;
}

/** Header, scrolling body, footer — the frame all six panes share. */
export function SettingsPane({
  title,
  subtitle,
  onClose,
  onSave,
  saving = false,
  error = null,
  children,
}: SettingsPaneProps) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex w-full shrink-0 items-center gap-[12px] pb-[8px] pl-[30px] pr-[22px] pt-[26px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
          <h2 className="text-[19px] font-semibold text-[var(--surface-fg)]">{title}</h2>
          <p className="text-[12px] text-[var(--surface-fg-muted)]">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-[18px] leading-none text-[var(--surface-fg-faint)] transition-colors hover:bg-[var(--surface-nav-active)] hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
        >
          ×
        </button>
      </header>

      <div className="flex w-full min-h-0 flex-1 flex-col gap-[12px] overflow-y-auto px-[30px] pb-[24px] pt-[20px]">
        {children}
      </div>

      {/* The same line under every pane, including the ones that save nothing
          to the account yet. */}
      <footer className="flex w-full shrink-0 items-center gap-[10px] pb-[18px] pl-[30px] pr-[22px] pt-[16px]">
        <p
          role={error ? 'alert' : undefined}
          className={`min-w-0 flex-1 text-[11px] ${
            error ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-faint)]'
          }`}
        >
          {error ?? 'Changes save to your account, not this board.'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center rounded-[7px] px-[14px] py-[8px] text-[12px] font-medium text-[var(--surface-fg-faint)] transition-colors hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave ?? onClose}
          disabled={saving}
          className="flex shrink-0 items-center rounded-[7px] bg-[var(--surface-accent)] px-[14px] py-[8px] text-[12px] font-medium text-[var(--surface-on-accent)] transition-colors hover:bg-[var(--surface-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-fg)] disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </footer>
    </div>
  );
}

/** The heading above a card — the design's only grouping device in a pane. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="w-full text-[12px] font-medium text-[var(--surface-fg-muted)]">{children}</p>
  );
}

/**
 * A card of rows.
 *
 * Every card in the design puts a hairline between neighbouring rows and none
 * at its edges, so the separators are drawn here rather than typed out fifteen
 * times — one fewer thing to get wrong when a row is added or moved.
 */
export function Card({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-[12px] border border-[var(--surface-border)] bg-[var(--surface-card)]">
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

/** A 62px row: something named on the left, something to do about it on the right. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="flex w-full items-center gap-[16px] px-[18px] py-[15px]">{children}</div>;
}

export function RowText({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
      <p className="text-[12.5px] font-medium text-[var(--surface-fg)]">{title}</p>
      <p className="text-[11px] text-[var(--surface-fg-faint)]">{hint}</p>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  /** For a field with nothing to write to — a guest's, or one mid-save. */
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-[240px] shrink-0 rounded-[7px] border border-[var(--surface-border)] bg-[var(--surface-input)] px-[10px] py-[8px] text-[12.5px] text-[var(--surface-fg)] placeholder:text-[var(--surface-fg-faint)] focus:border-[var(--surface-accent)] focus:outline-none disabled:opacity-60"
    />
  );
}

export function SecondaryButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center rounded-[7px] border border-[var(--surface-border)] bg-[var(--surface-raised)] px-[12px] py-[7px] text-[12px] font-medium text-[var(--surface-fg)] transition-colors hover:bg-[var(--surface-raised-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center rounded-[7px] px-[12px] py-[7px] text-[12px] font-medium text-[var(--surface-fg-faint)] transition-colors hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
    >
      {children}
    </button>
  );
}

/** The one button in the design that sits under a heading reading "Danger zone". */
export function DangerButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex shrink-0 items-center rounded-[7px] border border-[var(--surface-danger-border)] px-[12px] py-[7px] text-[12px] font-medium text-[var(--surface-danger)] transition-colors hover:bg-[var(--surface-danger-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-danger)]"
    >
      {children}
    </button>
  );
}

/** A row whose right-hand side states a fact rather than offering a control. */
export function ValueText({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[12.5px] text-[var(--surface-fg)]">{children}</span>;
}

/**
 * The 34×20 switch, with its 16px knob 2px inside either end.
 *
 * Nothing behind it persists yet, so it holds its own state and says what it is
 * for — the pane it lives on decides what it starts as.
 */
export function Toggle({
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
      className={`relative h-[20px] w-[34px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] ${
        on ? 'bg-[var(--surface-accent)]' : 'bg-[var(--surface-toggle-off)]'
      }`}
    >
      <span
        className={`absolute top-[2px] size-[16px] rounded-full bg-[var(--surface-on-accent)] transition-[left] ${
          on ? 'left-[16px]' : 'left-[2px]'
        }`}
      />
    </button>
  );
}

/** A 120px track with its reading beside it, as the storage row has it. */
export function Meter({ used, total, label }: { used: number; total: number; label: string }) {
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
