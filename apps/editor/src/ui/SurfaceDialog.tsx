import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { surfaceThemeVars, type SurfaceTheme } from './surface-palette';

/**
 * The design is set in Inter. Nothing in the app loads it, so this names it
 * first and falls back to the platform's own UI face rather than shipping a
 * webfont for the dialogs.
 */
const FONT_STACK = 'Inter, "Segoe UI", system-ui, -apple-system, sans-serif';

const SurfacePortalContext = createContext<HTMLElement | null>(null);

/**
 * Where a popup opened inside a dialog should portal to.
 *
 * Must be called from a component *inside* a `SurfaceDialog`. Calling it from
 * the component that renders one reads the context from above the provider and
 * quietly answers null, which sends the popup to `<body>` — underneath the
 * dialog's own overlay, where it is invisible rather than merely misplaced.
 *
 * A menu or a dropdown inside one of these cannot portal where it normally
 * would. The dialog sits on `<body>`, above the editor, so a popup left in the
 * editor's own container paints *behind* it — and it would read the editor's
 * chrome tokens rather than the surface, which is the wrong colour even when
 * it is on top. The dialog's backdrop is the right home: it is above the board,
 * it declares the surface, and unlike the panel it clips nothing.
 */
export function useSurfacePortal(): HTMLElement | null {
  return useContext(SurfacePortalContext);
}

export interface SurfaceDialogProps {
  open: boolean;
  title: string;
  /** The line under the title, saying what this window is for. */
  subtitle?: ReactNode;
  /** Sits left of the title — an avatar, a colour dot, an icon. */
  leading?: ReactNode;
  children: ReactNode;
  /** The buttons along the bottom. Omitted, there is no footer at all. */
  footer?: ReactNode;
  /** Panel width in pixels. The body scrolls; the panel never exceeds the window. */
  width?: number;
  theme: SurfaceTheme;
  onClose: () => void;
  /**
   * Wraps the body and footer in a form, so Enter submits and a footer button
   * of `type="submit"` works without a handler of its own.
   */
  onSubmit?: () => void;
  /** Escape and the backdrop stop closing it — for work that must not be lost. */
  dismissable?: boolean;
  /** Announces itself as interrupting, for a prompt that wants an answer. */
  alert?: boolean;
  className?: string;
  'data-testid'?: string;
}

/**
 * The window the app puts up when it stops the board to say or ask something.
 *
 * One shell for all of them: backdrop, panel, a header that names the window, a
 * body that scrolls, and a footer of buttons. Everything inside reads the
 * `var(--surface-*)` table this declares on its root, so a dialog never has to
 * think about the theme and can never drift from the others.
 *
 * Portalled rather than rendered where it is written. Several of these are
 * mounted inside the sidebar, which puts transforms on its rows — and a
 * transformed ancestor becomes the containing block for `position: fixed`,
 * which would pin a full-window overlay inside a 16rem column.
 */
export function SurfaceDialog({
  open,
  title,
  subtitle,
  leading,
  children,
  footer,
  width = 520,
  theme,
  onClose,
  onSubmit,
  dismissable = true,
  alert = false,
  className,
  'data-testid': testId,
}: SurfaceDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // State rather than a ref: popups inside need to re-render once it exists.
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);

  // Escape closes from anywhere inside, including the fields. Captured and
  // stopped, so it does not also reach the canvas and clear the selection
  // behind the dialog.
  useEffect(() => {
    if (!open || !dismissable) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, dismissable, onClose]);

  // Focus moves into the dialog so the keyboard is not left behind on the
  // canvas, where the editor's own shortcuts would still be listening. A field
  // inside that asks for focus takes it from here.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const body = (
    <>
      <div className="no-scrollbar flex w-full min-h-0 flex-1 flex-col gap-[12px] overflow-y-auto px-[30px] pt-[4px] pb-[22px]">
        {children}
      </div>
      {footer && (
        <footer className="flex w-full shrink-0 items-center gap-[10px] pt-[4px] pr-[22px] pb-[18px] pl-[30px]">
          {footer}
        </footer>
      )}
    </>
  );

  const content = (
    <div
      ref={setOverlay}
      style={{ ...surfaceThemeVars(theme), fontFamily: FONT_STACK }}
      // The text colour is set here rather than only on the pieces that need
      // it: a child with no colour of its own would otherwise inherit the
      // page's, which is near-black — invisible on a dark dialog. Popups
      // portal into this element too, so they inherit it as well.
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--surface-backdrop)] p-6 text-[var(--surface-fg)]"
      // Bound to mousedown rather than click, so a drag that starts inside a
      // field and ends outside it does not count as dismissing.
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        data-theme-variant={theme}
        style={{ width }}
        className={cn(
          'flex max-h-full max-w-full flex-col overflow-hidden rounded-[16px] border border-[var(--surface-border)] bg-[var(--surface-panel)] shadow-[var(--surface-shadow)] outline-none',
          className,
        )}
      >
        <header className="flex w-full shrink-0 items-center gap-[12px] pt-[26px] pr-[22px] pb-[14px] pl-[30px]">
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
            <h2
              id={titleId}
              className="truncate text-[19px] font-semibold text-[var(--surface-fg)]"
            >
              {title}
            </h2>
            {subtitle && (
              <div className="text-[12px] text-[var(--surface-fg-muted)]">{subtitle}</div>
            )}
          </div>
          {dismissable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-[28px] shrink-0 items-center justify-center rounded-[8px] text-[18px] leading-none text-[var(--surface-fg-faint)] transition-colors hover:bg-[var(--surface-nav-active)] hover:text-[var(--surface-fg)] focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)] focus-visible:outline-none"
            >
              ×
            </button>
          )}
        </header>

        <SurfacePortalProvider value={overlay}>
          {onSubmit ? (
            <form
              className="flex min-h-0 flex-1 flex-col"
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
        </SurfacePortalProvider>
      </div>
    </div>
  );

  // The server renderer has no portals. Rendering in place there keeps these
  // reachable from the smoke tests, which is the only context without a DOM.
  if (typeof document === 'undefined') return content;
  return createPortal(content, document.body);
}

function SurfacePortalProvider({
  value,
  children,
}: {
  value: HTMLElement | null;
  children: ReactNode;
}) {
  return <SurfacePortalContext.Provider value={value}>{children}</SurfacePortalContext.Provider>;
}
