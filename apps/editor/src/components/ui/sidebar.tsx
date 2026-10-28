'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { PanelLeftIcon } from 'lucide-react';
import { Slot } from 'radix-ui';

import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const SIDEBAR_COOKIE_NAME = 'sidebar_state';
const SIDEBAR_WIDTH_COOKIE_NAME = 'sidebar_width';
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
/** Widths the rail can be dragged between, in px. The default is the old fixed 16rem. */
export const SIDEBAR_WIDTH_DEFAULT = 256;
export const SIDEBAR_WIDTH_MIN = 240;
export const SIDEBAR_WIDTH_MAX = 480;
const SIDEBAR_WIDTH_MOBILE = '18rem';
const SIDEBAR_WIDTH_ICON = '3rem';
const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  /** The expanded width in px, whatever the state — collapsing keeps it for next time. */
  width: number;
  setWidth: (width: number) => void;
  /** True while the rail is being dragged, so nothing animates behind the pointer. */
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
};

/** A width the rail allows, so a stale cookie or a bad caller can't break the layout. */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.round(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, width)));
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.');
  }

  return context;
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** The expanded width to start at, in px; persisted to its own cookie once dragged. */
    defaultWidth?: number;
  }
>(function SidebarProvider(
  {
    defaultOpen = true,
    defaultWidth = SIDEBAR_WIDTH_DEFAULT,
    open: openProp,
    onOpenChange: setOpenProp,
    className,
    style,
    children,
    ...props
  },
  ref,
) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open],
  );

  const [width, _setWidth] = React.useState(() => clampSidebarWidth(defaultWidth));
  const [isResizing, setIsResizing] = React.useState(false);
  const setWidth = React.useCallback((value: number) => {
    _setWidth(clampSidebarWidth(value));
  }, []);

  // Persisted once a drag lets go rather than on every pointer move, and never
  // for the width it started at.
  const persistedWidth = React.useRef(width);
  React.useEffect(() => {
    if (isResizing || width === persistedWidth.current) return;
    persistedWidth.current = width;
    document.cookie = `${SIDEBAR_WIDTH_COOKIE_NAME}=${width}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
  }, [width, isResizing]);

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
  }, [isMobile, setOpen, setOpenMobile]);

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? 'expanded' : 'collapsed';

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      width,
      setWidth,
      isResizing,
      setIsResizing,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      width,
      setWidth,
      isResizing,
    ],
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          ref={ref}
          data-slot="sidebar-wrapper"
          style={
            {
              '--sidebar-width': `${width}px`,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            'group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar',
            className,
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
});

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    side?: 'left' | 'right';
    variant?: 'sidebar' | 'floating' | 'inset';
    collapsible?: 'offcanvas' | 'icon' | 'none';
  }
>(function Sidebar(
  { side = 'left', variant = 'sidebar', collapsible = 'offcanvas', className, children, ...props },
  ref,
) {
  const t = useT();
  const { isMobile, state, openMobile, setOpenMobile, isResizing } = useSidebar();

  if (collapsible === 'none') {
    return (
      <div
        ref={ref}
        data-slot="sidebar"
        className={cn(
          'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          ref={ref}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{t('sidebar.title')}</SheetTitle>
            <SheetDescription>{t('sidebar.mobileDescription')}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      ref={ref}
      className="group peer hidden text-sidebar-foreground md:block"
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-resizing={isResizing ? 'true' : undefined}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear group-data-[resizing=true]:transition-none',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[side=right]:rotate-180',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          'fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear group-data-[resizing=true]:transition-none md:flex',
          side === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          // Adjust the padding for floating and inset variants.
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l',
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  );
});

const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(function SidebarTrigger({ className, onClick, ...props }, ref) {
  const t = useT();
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn('size-7', className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">{t('sidebar.toggle')}</span>
    </Button>
  );
});

/** How far the pointer travels before a press on the rail counts as a drag. */
const RAIL_DRAG_THRESHOLD = 3;

interface RailDrag {
  startX: number;
  /** The sidebar's width when the press began: the icon column if collapsed. */
  startWidth: number;
  /** +1 when dragging away from the screen edge widens it (left side), -1 otherwise. */
  direction: 1 | -1;
  dragging: boolean;
}

/**
 * The sidebar's edge: click it to collapse or expand, drag it to resize.
 *
 * Dragging below half the minimum width collapses to the icon column, and
 * dragging out past it from there expands again, so one gesture covers both.
 * A drag never also counts as a click.
 */
const SidebarRail = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<'button'>>(
  function SidebarRail({ className, onClick, ...props }, ref) {
    const t = useT();
    const { toggleSidebar, open, setOpen, setWidth, isResizing, setIsResizing } = useSidebar();
    const drag = React.useRef<RailDrag | null>(null);
    const suppressClick = React.useRef(false);

    // The pointer leaves the rail as soon as it moves, so the resize cursor and
    // the ban on selecting text go on the whole page for the drag.
    React.useEffect(() => {
      if (!isResizing) return;
      const style = document.createElement('style');
      style.textContent = '* { cursor: col-resize !important; user-select: none !important; }';
      document.head.appendChild(style);
      return () => style.remove();
    }, [isResizing]);

    const endDrag = () => {
      if (drag.current?.dragging) setIsResizing(false);
      drag.current = null;
    };

    return (
      <button
        ref={ref}
        data-sidebar="rail"
        data-slot="sidebar-rail"
        data-resizing={isResizing ? 'true' : undefined}
        aria-label={t('sidebar.toggle')}
        tabIndex={-1}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const container = event.currentTarget.closest('[data-slot=sidebar-container]');
          const side = event.currentTarget.closest('[data-side]')?.getAttribute('data-side');
          if (!container) return;

          event.currentTarget.setPointerCapture(event.pointerId);
          suppressClick.current = false;
          drag.current = {
            startX: event.clientX,
            startWidth: container.getBoundingClientRect().width,
            direction: side === 'right' ? -1 : 1,
            dragging: false,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) return;
          const delta = (event.clientX - current.startX) * current.direction;

          if (!current.dragging) {
            if (Math.abs(delta) < RAIL_DRAG_THRESHOLD) return;
            current.dragging = true;
            suppressClick.current = true;
            setIsResizing(true);
          }

          const next = current.startWidth + delta;
          if (next < SIDEBAR_WIDTH_MIN / 2) {
            if (open) setOpen(false);
            return;
          }
          if (!open) setOpen(true);
          setWidth(next);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onClick={(event) => {
          onClick?.(event);
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          toggleSidebar();
        }}
        title={t('sidebar.toggle')}
        className={cn(
          'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border data-[resizing=true]:after:bg-sidebar-ring sm:flex',
          'cursor-col-resize',
          '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
          'group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar',
          '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
          '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
          // Inset: the rail is the gap between the sidebar and the rounded
          // panel, and draws no line of its own; the panel's edge is the line.
          'group-data-[variant=inset]:w-2! group-data-[variant=inset]:translate-x-0! group-data-[variant=inset]:after:hidden',
          'group-data-[side=left]:group-data-[variant=inset]:right-0!',
          // Collapsed, the panel keeps a margin of its own, so the gap is wider.
          '[[data-variant=inset][data-state=collapsed]_&]:w-3.5! [[data-side=left][data-variant=inset][data-state=collapsed]_&]:-right-1.5!',
          'group-data-[side=right]:group-data-[variant=inset]:left-0!',
          className,
        )}
        {...props}
      />
    );
  },
);

const SidebarInset = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'main'>>(
  function SidebarInset({ className, ...props }, ref) {
    return (
      <main
        ref={ref}
        data-slot="sidebar-inset"
        className={cn(
          'relative flex w-full flex-1 flex-col bg-background',
          'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
          className,
        )}
        {...props}
      />
    );
  },
);

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentPropsWithoutRef<typeof Input>
>(function SidebarInput({ className, ...props }, ref) {
  return (
    <Input
      ref={ref}
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn('h-8 w-full bg-background shadow-none', className)}
      {...props}
    />
  );
});

const SidebarHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarHeader({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="sidebar-header"
        data-sidebar="header"
        className={cn('flex flex-col gap-2 p-2', className)}
        {...props}
      />
    );
  },
);

const SidebarFooter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarFooter({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="sidebar-footer"
        data-sidebar="footer"
        className={cn('flex flex-col gap-2 p-2', className)}
        {...props}
      />
    );
  },
);

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentPropsWithoutRef<typeof Separator>
>(function SidebarSeparator({ className, ...props }, ref) {
  return (
    <Separator
      ref={ref}
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn('mx-2 w-auto bg-sidebar-border', className)}
      {...props}
    />
  );
});

const SidebarContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarContent({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="sidebar-content"
        data-sidebar="content"
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
          className,
        )}
        {...props}
      />
    );
  },
);

const SidebarGroup = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarGroup({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="sidebar-group"
        data-sidebar="group"
        className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
        {...props}
      />
    );
  },
);

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & { asChild?: boolean }
>(function SidebarGroupLabel({ className, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot.Root : 'div';

  return (
    <Comp
      ref={ref}
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...props}
    />
  );
});

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & { asChild?: boolean }
>(function SidebarGroupAction({ className, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      ref={ref}
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        'absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 md:after:hidden',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  );
});

const SidebarGroupContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarGroupContent({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="sidebar-group-content"
        data-sidebar="group-content"
        className={cn('w-full text-sm', className)}
        {...props}
      />
    );
  },
);

const SidebarMenu = React.forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<'ul'>>(
  function SidebarMenu({ className, ...props }, ref) {
    return (
      <ul
        ref={ref}
        data-slot="sidebar-menu"
        data-sidebar="menu"
        className={cn('flex w-full min-w-0 flex-col gap-1', className)}
        {...props}
      />
    );
  },
);

const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<'li'>>(
  function SidebarMenuItem({ className, ...props }, ref) {
    return (
      <li
        ref={ref}
        data-slot="sidebar-menu-item"
        data-sidebar="menu-item"
        className={cn('group/menu-item relative', className)}
        {...props}
      />
    );
  },
);

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        outline:
          'bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]',
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:p-0!',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
  } & VariantProps<typeof sidebarMenuButtonVariants>
>(function SidebarMenuButton(
  {
    asChild = false,
    isActive = false,
    variant = 'default',
    size = 'default',
    tooltip,
    className,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      ref={ref}
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (!tooltip) {
    return button;
  }

  if (typeof tooltip === 'string') {
    tooltip = {
      children: tooltip,
    };
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== 'collapsed' || isMobile}
        {...tooltip}
      />
    </Tooltip>
  );
});

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & {
    asChild?: boolean;
    showOnHover?: boolean;
  }
>(function SidebarMenuAction({ className, asChild = false, showOnHover = false, ...props }, ref) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      ref={ref}
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        'absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform peer-hover/menu-button:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        // Increases the hit area of the button on mobile.
        'after:absolute after:-inset-2 md:after:hidden',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground data-[state=open]:opacity-100 md:opacity-0',
        className,
      )}
      {...props}
    />
  );
});

const SidebarMenuBadge = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  function SidebarMenuBadge({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="sidebar-menu-badge"
        data-sidebar="menu-badge"
        className={cn(
          'pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums select-none',
          'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
          'peer-data-[size=sm]/menu-button:top-1',
          'peer-data-[size=default]/menu-button:top-1.5',
          'peer-data-[size=lg]/menu-button:top-2.5',
          'group-data-[collapsible=icon]:hidden',
          className,
        )}
        {...props}
      />
    );
  },
);

const SidebarMenuSkeleton = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'> & {
    showIcon?: boolean;
  }
>(function SidebarMenuSkeleton({ className, showIcon = false, ...props }, ref) {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      ref={ref}
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            '--skeleton-width': width,
          } as React.CSSProperties
        }
      />
    </div>
  );
});

const SidebarMenuSub = React.forwardRef<HTMLUListElement, React.ComponentPropsWithoutRef<'ul'>>(
  function SidebarMenuSub({ className, ...props }, ref) {
    return (
      <ul
        ref={ref}
        data-slot="sidebar-menu-sub"
        data-sidebar="menu-sub"
        className={cn(
          'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
          'group-data-[collapsible=icon]:hidden',
          className,
        )}
        {...props}
      />
    );
  },
);

const SidebarMenuSubItem = React.forwardRef<HTMLLIElement, React.ComponentPropsWithoutRef<'li'>>(
  function SidebarMenuSubItem({ className, ...props }, ref) {
    return (
      <li
        ref={ref}
        data-slot="sidebar-menu-sub-item"
        data-sidebar="menu-sub-item"
        className={cn('group/menu-sub-item relative', className)}
        {...props}
      />
    );
  },
);

const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<'a'> & {
    asChild?: boolean;
    size?: 'sm' | 'md';
    isActive?: boolean;
  }
>(function SidebarMenuSubButton(
  { asChild = false, size = 'md', isActive = false, className, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'a';

  return (
    <Comp
      ref={ref}
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-accent-foreground',
        'data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  );
});

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
