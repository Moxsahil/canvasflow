import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BACKDROP, CloseButton, SettingsButton, WINDOW } from '../settings/settings-ui';
import { surfaceThemeVars, type SurfaceTheme } from './surface-palette';

/** Named first, then the platform's own face, as the other dialogs have it. */
const FONT_STACK = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

// ---------------------------------------------------------------------------
// The windows that are open, newest last

interface OpenWindow {
  overlay: () => HTMLElement | null;
}

const openWindows: OpenWindow[] = [];

/**
 * Only the newest window takes input. The ones under it, and the editor under
 * all of them, go inert: no focus, no clicks, and nothing a screen reader
 * wanders into. Set on the elements directly rather than through state, so it
 * has already lifted by the time focus is handed back on close.
 */
function syncInert() {
  openWindows.forEach((window, index) => {
    const overlay = window.overlay();
    if (overlay) overlay.inert = index < openWindows.length - 1;
  });
  const root = document.getElementById('root');
  if (root) root.inert = openWindows.length > 0;
}

/**
 * Where focus goes back to when a window closes. A window chosen from a menu
 * was opened by a row that is gone by then, so it goes back to the button that
 * opened the menu instead.
 */
function openerFor(element: Element | null): HTMLElement | null {
  const menu = element?.closest('[role="menu"]');
  const trigger = menu?.getAttribute('aria-labelledby');
  const opener = trigger ? document.getElementById(trigger) : element;
  return opener instanceof HTMLElement ? opener : null;
}

const WindowContainerContext = createContext<HTMLElement | null>(null);

/**
 * Where a menu inside a window portals to: the window's own backdrop. It sits
 * above the board, it carries the palette and the theme attribute the menu
 * look reads its dark form from, and unlike the panel it clips nothing.
 */
export function useWindowContainer(): HTMLElement | null {
  return useContext(WindowContainerContext);
}

// ---------------------------------------------------------------------------
// The window

export interface SurfaceWindowProps {
  open: boolean;
  theme: SurfaceTheme;
  onClose: () => void;
  /** Panel width in pixels; it never exceeds the screen. */
  width: number;
  /** The id of the title that names it. */
  labelledBy: string;
  describedBy?: string;
  /** Announces itself as interrupting, for a question that wants an answer. */
  alert?: boolean;
  /**
   * False when Escape and a click outside must not close it, because what is
   * typed in it would be lost. Its × and Cancel still do.
   */
  dismissable?: boolean;
  /**
   * Asked first when Escape is pressed, for an edit in progress inside. True
   * when it dealt with the key, and the window stays.
   */
  onEscape?: () => boolean;
  /** Makes the window a form, so Enter submits it. */
  onSubmit?: () => void;
  /** Keys pressed anywhere inside, the window itself included. */
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
  'data-testid'?: string;
}

/**
 * The window the app puts up over the board, as Settings and Share have it: it
 * rises into place over a blurred board, and sinks away on close.
 *
 * Escape closes the newest thing first: a menu open inside, then an edit in
 * progress, then the window itself — and only the top window, when one is
 * stacked on another. While any window is open the editor's shortcuts hear
 * nothing, and focus goes back to what opened the window when it closes.
 *
 * Portalled to `<body>`: several are mounted inside the sidebar, whose rows are
 * transformed, and a transformed ancestor would pin a full-screen overlay
 * inside a column.
 */
export function SurfaceWindow({
  open,
  theme,
  onClose,
  width,
  labelledBy,
  describedBy,
  alert = false,
  dismissable = true,
  onEscape,
  onSubmit,
  onKeyDown,
  children,
  'data-testid': testId,
}: SurfaceWindowProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  // State as well as a ref: menus inside need to re-render once it exists.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const attachOverlay = useCallback((element: HTMLDivElement | null) => {
    overlayRef.current = element;
    setContainer(element);
  }, []);
  const panelRef = useRef<HTMLDivElement>(null);

  // Read while rendering the frame that opens it, before a field inside takes
  // focus and hides where it came from.
  const opener = useRef<HTMLElement | null>(null);
  if (!open) opener.current = null;
  else if (opener.current === null && typeof document !== 'undefined') {
    opener.current = openerFor(document.activeElement);
  }

  const latest = useRef({ onClose, onEscape, dismissable });
  latest.current = { onClose, onEscape, dismissable };

  useEffect(() => {
    if (!open) return;
    const entry: OpenWindow = { overlay: () => overlayRef.current };
    openWindows.push(entry);
    syncInert();
    const isTop = () => openWindows[openWindows.length - 1] === entry;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isTop()) return;
      // Stopped here, so it never also reaches the board and clears the
      // selection behind the window.
      event.stopPropagation();
      // A menu inside closes on this same key, through its own listener.
      if (overlayRef.current?.querySelector('[role="menu"]')) return;
      const { onClose: close, onEscape: escape, dismissable: canDismiss } = latest.current;
      if (escape?.()) return;
      if (canDismiss) close();
    };
    // The editor's shortcuts listen on the window, after the document: keys
    // pressed while this is open stop short of them.
    const hush = (event: KeyboardEvent) => {
      if (isTop()) event.stopPropagation();
    };
    document.addEventListener('keydown', handleEscape, true);
    document.addEventListener('keydown', hush);
    document.addEventListener('keyup', hush);

    // Focus into the window, on the control marked `data-autofocus` when there
    // is one. Done here rather than by `autoFocus` alone: a window opened from
    // a menu row would lose that to the menu, which holds on to focus until it
    // has closed.
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel).focus({
        preventScroll: true,
      });
    }
    const back = opener.current;

    return () => {
      document.removeEventListener('keydown', handleEscape, true);
      document.removeEventListener('keydown', hush);
      document.removeEventListener('keyup', hush);
      const index = openWindows.indexOf(entry);
      if (index !== -1) openWindows.splice(index, 1);
      syncInert();

      if (back?.isConnected && !back.closest('[inert]')) {
        back.focus({ preventScroll: true });
      } else {
        // Whatever opened it is gone: the window underneath, if there is one.
        const under = openWindows[openWindows.length - 1]?.overlay();
        under?.querySelector<HTMLElement>('[aria-modal="true"]')?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const surface = useMemo(() => ({ ...surfaceThemeVars(theme), fontFamily: FONT_STACK }), [theme]);

  const shell = (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <motion.div
            key="window"
            ref={attachOverlay}
            variants={BACKDROP}
            initial="hidden"
            animate="shown"
            exit="gone"
            style={surface}
            // The menus inside wear the editor's menu look, which takes its
            // dark form from this attribute on an ancestor.
            data-theme={theme}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--surface-backdrop)] p-6 text-[var(--surface-fg)] backdrop-blur-[3px]"
            // Bound to mousedown rather than click, so a drag that starts in a
            // field and ends outside does not count.
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && dismissable) onClose();
            }}
          >
            <motion.div
              ref={panelRef}
              variants={WINDOW}
              role={alert ? 'alertdialog' : 'dialog'}
              aria-modal="true"
              aria-labelledby={labelledBy}
              aria-describedby={describedBy}
              tabIndex={-1}
              data-testid={testId}
              data-theme-variant={theme}
              onKeyDown={onKeyDown}
              style={{ width }}
              className="flex max-h-full max-w-full flex-col overflow-hidden rounded-[16px] border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-[var(--surface-shadow)] outline-none"
            >
              <WindowContainerContext.Provider value={container}>
                {onSubmit ? (
                  <form
                    className="flex min-h-0 flex-1 flex-col"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onSubmit();
                    }}
                  >
                    {children}
                  </form>
                ) : (
                  children
                )}
              </WindowContainerContext.Provider>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );

  // The server renderer has no portals; rendering in place keeps these
  // reachable from the smoke tests.
  return typeof document === 'undefined' ? shell : createPortal(shell, document.body);
}

// ---------------------------------------------------------------------------
// The parts of a window

type Tone = 'ok' | 'warn' | 'danger' | 'accent' | 'soft';

const BADGE_TONES: Record<Tone, string> = {
  ok: 'bg-[var(--surface-ok-wash)] text-[var(--surface-ok)]',
  warn: 'bg-[var(--surface-warn-wash)] text-[var(--surface-warn)]',
  danger: 'bg-[var(--surface-danger-wash)] text-[var(--surface-danger)]',
  accent: 'bg-[var(--surface-accent)] text-[var(--surface-on-accent)]',
  soft: 'bg-[var(--surface-accent-wash)] text-[var(--surface-accent)]',
};

/** The 36px circle at the head of a window: what it is about, or how it went. */
export function WindowBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[36px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold [&_svg]:size-[16px]',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * The title, the line under it and the ×. The line is where a notice says what
 * happened; `<strong>` inside it is set in the title's colour.
 */
export function WindowHeader({
  titleId,
  title,
  description,
  descriptionId,
  lead,
  onClose,
}: {
  titleId: string;
  title: ReactNode;
  description?: ReactNode;
  descriptionId?: string;
  lead?: ReactNode;
  /** Omitted, there is no ×. */
  onClose?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-start gap-[12px] pt-[18px] pr-[16px] pl-[20px]">
      {lead}
      <div className="grid min-w-0 flex-1 gap-[4px] pt-[1px]">
        <h2
          id={titleId}
          className="truncate text-[16px] font-semibold tracking-[-0.01em] text-[var(--surface-fg)]"
        >
          {title}
        </h2>
        {description && (
          <div
            id={descriptionId}
            className="text-[12px] leading-[1.55] text-[var(--surface-fg-muted)] [&_strong]:font-semibold [&_strong]:text-[var(--surface-fg)]"
          >
            {description}
          </div>
        )}
      </div>
      {onClose && <CloseButton label="Close" onClick={onClose} />}
    </div>
  );
}

export function WindowBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('grid min-h-0 gap-[12px] px-[20px] pt-[14px]', className)}>{children}</div>
  );
}

/**
 * The foot: a quiet line on the left for how things stand, or what went wrong,
 * and the actions on the right.
 */
export function WindowFooter({
  status,
  danger = false,
  children,
}: {
  status?: ReactNode;
  /** Sets the line in the danger colour, for a failure. */
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-[8px] px-[20px] pt-[18px] pb-[18px]">
      <p
        role="status"
        className={cn(
          'min-w-0 flex-1 text-[11.5px] leading-[1.45]',
          danger ? 'text-[var(--surface-danger)]' : 'text-[var(--surface-fg-faint)]',
        )}
      >
        {status}
      </p>
      {children}
    </div>
  );
}

/** A window's button: the Settings one, a size up, as a dialog's actions are. */
interface WindowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'secondary' | 'primary' | 'danger' | 'ghost';
}

export const WindowButton = forwardRef<HTMLButtonElement, WindowButtonProps>(function WindowButton(
  { className, ...props },
  ref,
) {
  return (
    <SettingsButton
      ref={ref}
      className={cn('h-[32px] px-[14px] text-[12.5px] [&_svg]:size-[14px]', className)}
      {...props}
    />
  );
});
