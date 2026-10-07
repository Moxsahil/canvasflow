import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  AtSign,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  Crown,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  HardDrive,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  MessageSquare,
  Monitor,
  MousePointer2,
  Receipt,
  Share,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  BandContext,
  useBand,
  useEscape,
  useSettingsFrame,
  type BandStatus,
} from './settings-frame';

/**
 * The pieces every Settings page is built from.
 *
 * A page is a lead line and a stack of groups. A group is a small caption with
 * a rule running off to the right, and its rows under it. A row starts with an
 * icon in a soft circle, says what it is, and ends with its control; nothing
 * divides one row from the next, and the row under the pointer lights up — in
 * red for the rows that leave or delete, which are named in red too.
 */

export const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Moves sideways the way you went: forward comes in from the right, back from
 * the left. With reduced motion the slide drops out and the fade stays.
 */
export const SLIDE: Variants = {
  enter: (direction: number) => ({ x: 40 * direction, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.24, ease: EASE } },
  exit: (direction: number) => ({
    x: -40 * direction,
    opacity: 0,
    transition: { duration: 0.18, ease: EASE },
  }),
};

/**
 * A row: lit under the pointer, and when a search lands on it, then fading.
 * `group/row` lets its icon answer the highlight too.
 */
const ROW =
  'group/row flex items-center gap-[12px] rounded-[10px] px-[10px] py-[9px] transition-[background-color] duration-[600ms] hover:bg-[var(--surface-wash)] hover:duration-150 data-[flash]:bg-[var(--surface-flash)] data-[flash]:duration-0';

const TITLE = 'text-[12.5px] font-medium text-[var(--surface-fg)]';
const HINT = 'text-[11.5px] text-[var(--surface-fg-muted)]';

/**
 * Every row's icon, by the id search already knows it by, so a page names a
 * row once and the icon follows.
 */
const ROW_ICONS: Record<string, LucideIcon> = {
  'display-name': Type,
  username: AtSign,
  'cursor-colour': MousePointer2,
  email: Mail,
  password: KeyRound,
  'connected-accounts': Link2,
  'two-factor': ShieldCheck,
  sessions: Monitor,
  'sign-out-everywhere': LogOut,
  'workspace-name': Building2,
  role: Crown,
  members: Users,
  'board-access': Globe,
  'leave-workspace': LogOut,
  'board-shared': Share,
  'comment-mentions': MessageSquare,
  'invite-accepted': UserPlus,
  'weekly-digest': CalendarDays,
  'product-updates': Sparkles,
  plan: Zap,
  seats: Users,
  storage: Database,
  'payment-method': CreditCard,
  invoices: Receipt,
  export: Download,
  'storage-used': HardDrive,
  analytics: BarChart3,
  terms: FileText,
  'privacy-policy': Eye,
  'delete-account': Trash2,
};

/** The rows whose icon and name are in the danger colour, and whose highlight is red. */
const DANGER_ROWS = new Set(['leave-workspace', 'delete-account']);

function rowClasses(setting: string): string {
  return cn(ROW, DANGER_ROWS.has(setting) && 'hover:bg-[var(--surface-danger-wash)]');
}

/** The icon at the start of a row, in a soft circle that lifts under the pointer. */
function RowIcon({ setting }: { setting: string }) {
  const Icon = ROW_ICONS[setting];
  if (!Icon) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[32px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-wash)] transition-colors group-hover/row:bg-[var(--surface-panel)]',
        DANGER_ROWS.has(setting)
          ? 'text-[var(--surface-danger)]'
          : 'text-[var(--surface-fg-muted)]',
      )}
    >
      <Icon className="size-[16px]" strokeWidth={1.75} />
    </span>
  );
}

/**
 * A row's control column. Its buttons are pills — outlined on the panel,
 * the primary in the accent — and its select and fields round off to match.
 */
const CONTROLS = cn(
  'flex shrink-0 items-center gap-[8px]',
  '[&_[data-variant]]:rounded-full [&_[data-variant]]:px-[12px]',
  '[&_[data-variant=secondary]]:bg-[var(--surface-panel)] [&_[data-variant=secondary]:hover]:border-[var(--surface-fg-faint)] [&_[data-variant=secondary]:hover]:bg-[var(--surface-panel)]',
  '[&_[data-variant=danger]]:bg-transparent [&_[data-variant=danger]:hover]:bg-[var(--surface-danger-wash)]',
);

/** The cross and tick inside a pill field that has been changed. */
export const INLINE_ACTION =
  'flex h-[22px] w-[26px] items-center justify-center rounded-full text-[var(--surface-fg-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] disabled:opacity-50';

/** A text field in a row: a pill at the end of it. */
export const ROW_INPUT =
  'h-[30px] w-[220px] rounded-full border border-[var(--surface-border)] bg-[var(--surface-input)] px-[12px] text-[12.5px] text-[var(--surface-fg)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--surface-fg-faint)] focus:border-[var(--surface-accent)] focus:shadow-[0_0_0_3px_var(--surface-accent-wash)] disabled:opacity-60';

/**
 * A thin scrollbar with a rounded thumb in a quiet tone, on no track at all —
 * the browser's own, so it keeps its arrows and its keyboard.
 */
export const SCROLLBAR =
  '[scrollbar-color:var(--surface-scrollbar)_transparent] [scrollbar-width:thin]';

/** A field as the design draws it: recessed, with a soft ring when focused. */
export const INPUT =
  'h-[32px] w-full rounded-[7px] border border-[var(--surface-border)] bg-[var(--surface-input)] px-[10px] text-[12.5px] text-[var(--surface-fg)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--surface-fg-faint)] focus:border-[var(--surface-accent)] focus:shadow-[0_0_0_3px_var(--surface-accent-wash)] disabled:opacity-60';

// ---------------------------------------------------------------------------
// The page

/** The scrolling part of a page. The header watches it to know when to tuck away. */
function Scroller({ children }: { children: ReactNode }) {
  const frame = useSettingsFrame();
  const ref = useRef<HTMLDivElement>(null);

  // A page that has just come in starts at the top, so the header comes back.
  useEffect(() => {
    if (ref.current) frame?.onPageScroll(ref.current);
  }, [frame]);

  return (
    <div
      ref={ref}
      data-settings-scroll
      onScroll={(event) => frame?.onPageScroll(event.currentTarget)}
      className={cn('h-full overflow-y-auto px-[12px] pt-[6px] pb-[28px]', SCROLLBAR)}
    >
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

/**
 * One tab's page: its lead line and bands, and any dialog one of its rows has
 * opened over the window.
 */
export function SettingsPage({
  lead,
  dialog,
  children,
}: {
  lead: string;
  /**
   * A dialog opened from a row — changing a password, positioning a photo.
   * Keyed, so it can animate out when it closes.
   */
  dialog?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <Scroller>
        <p className="mx-[10px] mt-[10px] mb-[2px] text-[12px] text-[var(--surface-fg-muted)]">
          {lead}
        </p>
        {children}
      </Scroller>
      <AnimatePresence>{dialog || null}</AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bands

interface Said {
  kind: 'saved' | 'error';
  message?: string;
  visible: boolean;
}

/**
 * One group of settings: a small caption with a rule running off to the right,
 * and its rows under it. The end of the caption's line is where the group says
 * a change saved, or why it did not, so the answer turns up by the question.
 */
export function Band({
  title,
  danger = false,
  error = null,
  children,
}: {
  title: string;
  /** Captions the group in the danger colour — the one holding Delete account. */
  danger?: boolean;
  /** Something wrong with the whole group, such as it failing to load. */
  error?: string | null;
  children: ReactNode;
}) {
  const [said, setSaid] = useState<Said | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const status = useMemo<BandStatus>(
    () => ({
      saved() {
        clearTimeout(timer.current);
        setSaid({ kind: 'saved', visible: true });
        timer.current = setTimeout(
          () => setSaid((current) => current && { ...current, visible: false }),
          1400,
        );
      },
      failed(message) {
        clearTimeout(timer.current);
        setSaid({ kind: 'error', message, visible: true });
      },
      clear() {
        clearTimeout(timer.current);
        setSaid((current) => current && { ...current, visible: false });
      },
    }),
    [],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  const shown: Said | null = error ? { kind: 'error', message: error, visible: true } : said;

  return (
    <BandContext.Provider value={status}>
      <section aria-label={title} className="flex shrink-0 flex-col">
        <div
          className={cn(
            'mx-[10px] mt-[16px] mb-[4px] flex items-center gap-[10px] text-[11.5px] font-semibold',
            danger ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-faint)]',
          )}
        >
          <h3>{title}</h3>
          <span
            aria-hidden="true"
            className={cn(
              'h-px flex-1',
              danger ? 'bg-[var(--surface-danger-border)]' : 'bg-[var(--surface-line)]',
            )}
          />
          <p
            role="status"
            aria-live="polite"
            className={cn(
              'flex items-center gap-[4px] font-medium transition-opacity duration-300',
              shown?.visible ? 'opacity-100' : 'opacity-0',
              shown?.kind === 'error' ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-ok)]',
            )}
          >
            {shown?.kind === 'saved' && (
              <>
                <Check className="size-[12px]" strokeWidth={2.4} aria-hidden="true" />
                Saved
              </>
            )}
            {shown?.kind === 'error' && shown.message}
          </p>
        </div>
        <div className="flex min-w-0 flex-col">{children}</div>
      </section>
    </BandContext.Provider>
  );
}

/**
 * A setting on one line: its icon, what it is, and something to do about it at
 * the end.
 */
export function SettingRow({
  setting,
  title,
  hint,
  badge,
  leading,
  children,
}: {
  /** Where search lands. Matches an id in SETTINGS_INDEX, and names the row's icon. */
  setting: string;
  title: ReactNode;
  hint: ReactNode;
  /** Beside the title: a status, or that the row is not built yet. */
  badge?: ReactNode;
  /** In the icon's place — the photo, on the photo row. */
  leading?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div data-setting={setting} className={rowClasses(setting)}>
      {leading ?? <RowIcon setting={setting} />}
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="flex items-center gap-[8px]">
          <p className={cn(TITLE, DANGER_ROWS.has(setting) && 'text-[var(--surface-danger)]')}>
            {title}
          </p>
          {badge}
        </div>
        <p className={HINT}>{hint}</p>
      </div>
      {children && <div className={CONTROLS}>{children}</div>}
    </div>
  );
}

/**
 * A setting whose control is a field or a set of choices: the same row, with
 * the label naming the control at its end.
 */
export function StackedField({
  setting,
  label,
  htmlFor,
  badge,
  hint,
  after,
  children,
}: {
  setting: string;
  label: string;
  /** The control the label names, when it is a single field. */
  htmlFor?: string;
  badge?: ReactNode;
  hint: ReactNode;
  /** After the control. */
  after?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div data-setting={setting} className={rowClasses(setting)}>
      <RowIcon setting={setting} />
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="flex items-center gap-[8px]">
          {htmlFor ? (
            <label htmlFor={htmlFor} className={TITLE}>
              {label}
            </label>
          ) : (
            <p className={TITLE}>{label}</p>
          )}
          {badge}
        </div>
        <div className={HINT}>{hint}</div>
      </div>
      <div className={CONTROLS}>
        {children}
        {after}
      </div>
    </div>
  );
}

/**
 * A text setting that saves on its own.
 *
 * A pill at the end of its row. Once it differs from what is saved, a cross
 * and a tick appear inside it; Enter saves and Escape puts the saved value
 * back. The group's caption says when it has saved.
 */
export function InlineTextField({
  setting,
  label,
  hint,
  value,
  onSave,
  placeholder,
  disabled = false,
  badge,
  error = null,
  onEdit,
  announce = true,
  maxLength,
}: {
  setting: string;
  label: string;
  hint: string;
  /** What is saved now. The field follows it until someone types. */
  value: string;
  /**
   * Keep the new value, already trimmed. Resolves false when it did not keep
   * it, having said why through `error`.
   */
  onSave?: (next: string) => Promise<boolean> | boolean;
  placeholder?: string;
  disabled?: boolean;
  badge?: ReactNode;
  /** Why the last save did not go through, shown in place of the hint. */
  error?: string | null;
  /** Called as someone types, so a stale error can be cleared. */
  onEdit?: () => void;
  /**
   * Whether the band says "Saved" afterwards. Off for a field with nowhere to
   * save to yet, which should not claim otherwise.
   */
  announce?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const band = useBand();
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);

  useEffect(() => {
    if (!touched.current) setDraft(value);
  }, [value]);

  const dirty = draft !== value;

  const revert = () => {
    touched.current = false;
    setDraft(value);
    onEdit?.();
  };

  const save = async () => {
    const next = draft.trim();
    if (busy || !onSave) return;
    if (next === value) {
      revert();
      return;
    }
    setBusy(true);
    const kept = await onSave(next);
    setBusy(false);
    if (!kept) return;
    touched.current = false;
    setDraft(next);
    if (announce) band?.saved();
  };

  useEscape(focused && dirty && !busy ? revert : null);

  return (
    <StackedField
      setting={setting}
      label={label}
      htmlFor={id}
      badge={badge}
      hint={
        error ? (
          <span role="alert" className="text-[var(--surface-danger)]">
            {error}
          </span>
        ) : (
          hint
        )
      }
    >
      <span className="relative inline-flex items-center">
        <input
          id={id}
          type="text"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            touched.current = true;
            setDraft(event.target.value);
            onEdit?.();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (dirty) void save();
            }
          }}
          className={cn(
            ROW_INPUT,
            dirty && !disabled && 'pr-[60px]',
            error && 'border-[var(--surface-danger-border)]',
          )}
        />
        {dirty && !disabled && (
          <span className="absolute right-[4px] flex gap-[2px]">
            <button
              type="button"
              aria-label="Cancel"
              title="Cancel"
              disabled={busy}
              onClick={revert}
              className={INLINE_ACTION}
            >
              <X className="size-[14px]" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={busy ? 'Saving…' : 'Save'}
              title="Save"
              disabled={busy}
              onClick={() => void save()}
              className={cn(INLINE_ACTION, 'text-[var(--surface-accent)]')}
            >
              <Check className="size-[14px]" aria-hidden="true" />
            </button>
          </span>
        )}
      </span>
    </StackedField>
  );
}

// ---------------------------------------------------------------------------
// Controls

type ButtonVariant = 'secondary' | 'primary' | 'danger' | 'ghost';

const BUTTON =
  'inline-flex h-[28px] shrink-0 items-center justify-center gap-[6px] whitespace-nowrap rounded-[7px] px-[11px] text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  secondary:
    'border border-[var(--surface-border)] bg-[var(--surface-wash)] text-[var(--surface-fg)] hover:bg-[var(--surface-wash-hover)] focus-visible:ring-[var(--surface-accent)]',
  primary:
    'border border-[var(--surface-accent)] bg-[var(--surface-accent)] text-[var(--surface-on-accent)] hover:bg-[var(--surface-accent-hover)] focus-visible:ring-[var(--surface-fg)]',
  // A wash of the danger colour rather than a fill: the solid fill is kept for
  // the one thing the page wants you to do, and that is never destruction.
  danger:
    'border border-[var(--surface-danger-border)] bg-[var(--surface-danger-wash)] text-[var(--surface-danger)] hover:border-[var(--surface-danger)] focus-visible:ring-[var(--surface-danger)]',
  ghost:
    'text-[var(--surface-fg-muted)] hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:ring-[var(--surface-accent)]',
};

interface SettingsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** A row's button. Inert without an `onClick`, as the rows with nothing behind them leave it. */
export const SettingsButton = forwardRef<HTMLButtonElement, SettingsButtonProps>(
  function SettingsButton({ variant = 'secondary', type = 'button', className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        data-variant={variant}
        className={cn(BUTTON, BUTTON_VARIANTS[variant], className)}
        {...props}
      />
    );
  },
);

/**
 * A row's way out to a page somewhere else, dressed as its button.
 *
 * A real link rather than a button that navigates, so it can be opened, copied
 * or middle-clicked like any other. It opens a new tab, so the board and this
 * window are still here afterwards.
 */
export function ExternalLinkButton({
  href,
  label,
  children,
}: {
  href: string;
  /** Where it goes, for screen readers, when the visible text alone would not say. */
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      data-variant="secondary"
      className={cn(BUTTON, BUTTON_VARIANTS.secondary)}
    >
      {children}
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

/** The 32×18 switch. The page it sits on decides what flipping it does. */
export function Toggle({
  label,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-panel)] disabled:opacity-50',
        on ? 'bg-[var(--surface-accent)]' : 'bg-[var(--surface-toggle-off)]',
      )}
    >
      <span
        className={cn(
          'absolute left-[2px] top-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-[cubic-bezier(.3,.7,.2,1)]',
          on && 'translate-x-[14px]',
        )}
      />
    </button>
  );
}

/** A row whose right-hand side states a fact rather than offering a control. */
export function ValueText({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-[12px] whitespace-nowrap text-[var(--surface-fg-muted)]">
      {children}
    </span>
  );
}

/** A 120px track with its reading beside it, as the storage row has it. */
export function Meter({ used, total, label }: { used: number; total: number; label: string }) {
  const ratio = total > 0 ? Math.min(Math.max(used / total, 0), 1) : 0;
  return (
    <span className="flex shrink-0 items-center gap-[10px]">
      <span
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="block h-[6px] w-[120px] overflow-hidden rounded-full bg-[var(--surface-toggle-off)]"
      >
        <span
          style={{ width: `${ratio * 100}%` }}
          className="block h-full rounded-full bg-[var(--surface-accent)]"
        />
      </span>
      <ValueText>{label}</ValueText>
    </span>
  );
}

/** A small pill beside a title: verified, connected, this device. */
export function StatusTag({
  tone,
  children,
}: {
  tone: 'positive' | 'caution' | 'neutral';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-[8px] py-[2px] text-[10.5px] font-medium whitespace-nowrap',
        tone === 'positive' && 'bg-[var(--surface-ok-wash)] text-[var(--surface-ok)]',
        tone === 'caution' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        tone === 'neutral' && 'bg-[var(--surface-wash)] text-[var(--surface-fg-muted)]',
      )}
    >
      {children}
    </span>
  );
}

/**
 * Says a row is not built yet, on a row that otherwise looks like the ones that
 * are.
 *
 * Hiding it would have somebody who looks for the setting conclude it does not
 * exist; this leaves it where it will be and tells the truth about it.
 */
export function ComingSoonTag() {
  return <StatusTag tone="neutral">Coming soon</StatusTag>;
}

export function ErrorLine({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-[11.5px] text-[var(--surface-danger)]">
      {children}
    </p>
  );
}

/** A plain list inside a dialog — sessions, sign-in methods — split by hairlines. */
export function DialogList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col divide-y divide-[var(--surface-line)]">{children}</ul>;
}

export function DialogListRow({
  title,
  detail,
  tag,
  icon,
}: {
  title: string;
  detail?: string;
  tag?: ReactNode;
  /** Before the words: the provider's mark, on a sign-in method. */
  icon?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-[12px] py-[11px] first:pt-[2px]">
      {icon && (
        <span className="flex size-[20px] shrink-0 items-center justify-center text-[var(--surface-fg)]">
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <p className={cn(TITLE, 'truncate')}>{title}</p>
        {detail && <p className={HINT}>{detail}</p>}
      </div>
      {tag}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Dialogs

/** The board fades and blurs; a window rises into place over it and sinks away. */
export const BACKDROP: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.22 } },
  gone: { opacity: 0, transition: { duration: 0.2 } },
};

export const WINDOW: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.26, ease: EASE } },
  gone: { opacity: 0, y: 8, scale: 0.985, transition: { duration: 0.17, ease: EASE } },
};

/** The ×, as the Settings window has it. */
export function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-[28px] shrink-0 items-center justify-center rounded-[7px] text-[var(--surface-fg-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
    >
      <X className="size-[16px]" aria-hidden="true" />
    </button>
  );
}

/**
 * Something done in more than one move — changing a password, deleting the
 * account — in a dialog of its own over the Settings window.
 *
 * Drawn as a smaller Settings window: the same surface, the title and × across
 * the top, the same rise into place, and what it will do said before the
 * fields. Settings stays where it was underneath, out of reach until this
 * closes; Escape, ×, a click outside or the Cancel in `actions` close it, and
 * focus goes back to the button that opened it.
 */
export function SettingsModal({
  title,
  description,
  onClose,
  onSubmit,
  actions,
  width = 440,
  children,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  /** When set, the dialog is a form, so Enter submits it. */
  onSubmit?: () => void;
  actions: ReactNode;
  width?: number;
  children?: ReactNode;
}) {
  const frame = useSettingsFrame();
  const panelRef = useRef<HTMLDivElement>(null);
  // Whatever had focus as this opened: the button that opened it.
  const [opener] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );

  useEscape(onClose);
  useEffect(() => frame?.holdModal(opener), [frame, opener]);

  // Focus comes in with it, unless a field inside has already asked for it.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  }, []);

  const body = (
    <>
      {children && (
        <div
          className={cn(
            'flex min-h-0 flex-col gap-[12px] overflow-y-auto px-[20px] pt-[16px]',
            SCROLLBAR,
          )}
        >
          {children}
        </div>
      )}
      <div className="flex shrink-0 items-center justify-end gap-[8px] px-[20px] pb-[20px] pt-[20px]">
        {actions}
      </div>
    </>
  );

  const dialog = (
    <motion.div
      variants={BACKDROP}
      initial="hidden"
      animate="shown"
      exit="gone"
      // It is outside the Settings window's element, so it brings the palette.
      style={frame?.surface}
      className="fixed inset-0 z-[1010] flex items-center justify-center bg-[var(--surface-backdrop)] p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={panelRef}
        variants={WINDOW}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ width }}
        className="flex max-h-full max-w-full flex-col overflow-hidden rounded-[16px] border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[var(--surface-fg)] shadow-[var(--surface-shadow)] outline-none"
      >
        <header className="flex shrink-0 items-start gap-[10px] px-[20px] pt-[18px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[6px] pt-[2px]">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
            {description && (
              <div className="text-[12px] leading-[1.55] text-[var(--surface-fg-muted)]">
                {description}
              </div>
            )}
          </div>
          <CloseButton label="Close" onClick={onClose} />
        </header>
        {onSubmit ? (
          <form
            className="flex min-h-0 flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </motion.div>
    </motion.div>
  );

  // Rendered in place where there is no document to portal into, as on the server.
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
