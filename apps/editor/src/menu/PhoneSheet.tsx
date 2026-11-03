import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useT } from '../i18n';

/** How far a sheet is dragged down, in CSS pixels, before letting go closes it. */
const DISMISS_DRAG = 90;

interface PhoneSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** A line under the title: an address, an account, what the page holds. */
  meta?: string | null;
  /** Before the title: a thumbnail, a badge, a photo. */
  lead?: ReactNode;
  /** A page inside the sheet: the header offers the way back to the first. */
  onBack?: () => void;
  /** Changes when the sheet turns a page, so the new one slides in. */
  page?: string;
  container: HTMLElement | null;
  children: ReactNode;
}

/**
 * A sheet that rises from the bottom of a phone, in thumb reach: what can be
 * done to a board, a workspace or the account. A grabber to drag it away by, a
 * title, and its rows in rounded groups.
 *
 * A layer of its own over the drawer that opened it, so the drawer stays
 * where it was underneath and is there again when the sheet goes.
 */
export function PhoneSheet({
  open,
  onOpenChange,
  title,
  meta,
  lead,
  onBack,
  page,
  container,
  children,
}: PhoneSheetProps) {
  const t = useT();
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  const endDrag = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag > DISMISS_DRAG) onOpenChange(false);
    setDrag(0);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        container={container}
        showCloseButton={false}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        className={cn(
          'mx-auto w-[min(calc(100%-12px),480px)] gap-0 rounded-t-[24px] border border-b-0 border-sidebar-border',
          'bg-sidebar p-0 text-sidebar-foreground shadow-[0_-16px_50px_rgb(0_0_0/0.35)]',
          'max-h-[calc(100dvh-36px-env(safe-area-inset-top))] pb-[calc(env(safe-area-inset-bottom)+14px)]',
          'data-[state=open]:duration-300',
        )}
        data-testid="phone-sheet"
      >
        <div
          className="shrink-0 cursor-grab touch-none"
          onPointerDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            start.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (start.current === null) return;
            setDrag(Math.max(0, event.clientY - start.current));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div aria-hidden="true" className="grid h-[22px] place-items-center">
            <span className="h-[5px] w-9 rounded-full bg-sidebar-foreground/25" />
          </div>
          <div className="flex items-center gap-3 pt-0.5 pr-3.5 pb-3.5 pl-4">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={t('common.back')}
                className="-ml-2 grid size-8 shrink-0 place-items-center rounded-full"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
            )}
            {lead}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base font-semibold text-sidebar-foreground">
                {title}
              </SheetTitle>
              {meta ? (
                <SheetDescription className="mt-px truncate text-[12.5px] text-sidebar-foreground/60">
                  {meta}
                </SheetDescription>
              ) : (
                <SheetDescription className="sr-only">{title}</SheetDescription>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('common.close')}
              className="grid size-[30px] shrink-0 place-items-center rounded-full bg-sidebar-accent text-sidebar-foreground/80"
            >
              <X className="size-[15px]" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          key={page}
          className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-0.5 duration-200 animate-in fade-in-0 slide-in-from-right-4 motion-reduce:animate-none"
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Rows that belong together, in one rounded group. */
export function SheetGroup({ children, inset = true }: { children: ReactNode; inset?: boolean }) {
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-[14px] bg-sidebar-accent',
        inset ? '[--rule-left:47px]' : '[--rule-left:16px]',
      )}
    >
      {children}
    </div>
  );
}

const rowClasses = cn(
  'relative flex min-h-12 w-full items-center gap-3 pr-3.5 pl-4 text-left text-[15px] text-sidebar-foreground',
  'not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-(--rule-left) not-first:before:h-px not-first:before:bg-sidebar-border',
  'active:bg-sidebar-foreground/5 disabled:opacity-40 [&>svg]:size-[19px] [&>svg]:shrink-0 [&>svg]:text-sidebar-foreground/60',
);

interface SheetRowProps {
  icon?: ReactNode;
  label: ReactNode;
  /** A second line, smaller, under the label. */
  sub?: ReactNode;
  /** At the far end: a value, a chevron, a tick, a switch. */
  end?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  role?: string;
  checked?: boolean;
  testId?: string;
}

/** One row of a group: a button, unless it only holds a control of its own. */
export function SheetRow({
  icon,
  label,
  sub,
  end,
  onClick,
  disabled,
  danger,
  role,
  checked,
  testId,
}: SheetRowProps) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1 py-[11px] leading-tight">
        {label}
        {sub && (
          <span className="mt-0.5 block text-[12.5px] text-sidebar-foreground/60">{sub}</span>
        )}
      </span>
      {end && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[13.5px] text-sidebar-foreground/60">
          {end}
        </span>
      )}
    </>
  );
  const classes = cn(rowClasses, danger && 'text-destructive [&>svg]:text-destructive');
  if (!onClick) {
    return (
      <div className={classes} data-testid={testId}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      role={role}
      aria-checked={checked}
      data-testid={testId}
    >
      {body}
    </button>
  );
}

/** The few actions worth a large target, across the top of a sheet. */
export function SheetTiles({ children }: { children: ReactNode }) {
  return <div className="grid shrink-0 grid-cols-4 gap-2">{children}</div>;
}

export function SheetTile({
  icon,
  label,
  onClick,
  primary = false,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        'flex flex-col items-center gap-[7px] rounded-[14px] px-1 pt-[13px] pb-2.5 text-xs disabled:opacity-40 [&>svg]:size-5',
        primary
          ? 'bg-primary text-primary-foreground'
          : 'bg-sidebar-accent text-sidebar-foreground active:bg-sidebar-foreground/10',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** An on/off switch drawn at a row's end; the row itself is what is pressed. */
export function RowSwitch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative h-5 w-[34px] shrink-0 rounded-full transition-colors',
        on ? 'bg-primary' : 'bg-sidebar-foreground/25',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-4 rounded-full bg-white transition-[left]',
          on ? 'left-4' : 'left-0.5',
        )}
      />
    </span>
  );
}
