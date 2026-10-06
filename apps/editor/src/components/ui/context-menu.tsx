import * as React from 'react';
import { ContextMenu as ContextMenuPrimitive } from 'radix-ui';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  MenuBadge,
  MenuRowEnd,
  MenuRowIcon,
  MenuToggleBox,
  menuLabelClasses,
  menuPanelClasses,
  menuRowClasses,
  menuSeparatorClasses,
  menuSlide,
  menuSubTriggerClasses,
  useMenuPress,
} from './menu-look';

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuSub = ContextMenuPrimitive.Sub;

/** The shared panel, capped to the room the popper reports and scrolled past it. */
const panelClasses = cn(menuPanelClasses, 'max-h-(--radix-context-menu-content-available-height)');

/**
 * Radix treats a release it never saw pressed as a click, whatever the button.
 * The menu opens under a right-button press, so letting go of that button over
 * a row after drifting onto it would run the row.
 */
function ignoreSecondaryRelease(event: React.PointerEvent) {
  if (event.button !== 0) event.preventDefault();
}

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content> & {
    /**
     * Where to portal the popup. The theme is read off `.cf-editor`, so a popup
     * left at `<body>` would ignore the dark switch.
     */
    container?: HTMLElement | null;
  }
>(function ContextMenuContent({ className, container, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Portal container={container ?? undefined}>
      <ContextMenuPrimitive.Content
        ref={ref}
        className={cn(panelClasses, className)}
        // Right-clicking the menu itself would otherwise open the browser's.
        onContextMenu={(event) => event.preventDefault()}
        {...props}
      >
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
});

type ItemProps = React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
  /** On the right, at 16px. */
  icon?: React.ReactNode;
  /** A small tag just before the icon, such as "Soon". */
  badge?: React.ReactNode;
};

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  ItemProps
>(function ContextMenuItem({ className, children, icon, badge, onPointerUp, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      className={cn(menuRowClasses, className)}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        ignoreSecondaryRelease(event);
      }}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <MenuRowEnd badge={badge} icon={icon} />
    </ContextMenuPrimitive.Item>
  );
});

type ToggleItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>,
  'checked' | 'onCheckedChange' | 'onSelect'
> & {
  checked: boolean;
  onToggle?: () => void;
  badge?: React.ReactNode;
};

/**
 * A setting switched from the menu. The menu stays open, so the box can be
 * seen to change: it slides to its new state and gives a small press.
 */
const ContextMenuToggleItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  ToggleItemProps
>(function ContextMenuToggleItem(
  { className, children, checked, onToggle, badge, onPointerUp, ...props },
  ref,
) {
  const [pressed, press] = useMenuPress();

  return (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      checked={checked}
      // Clipped, so the box sliding out of the way stays inside its row: on the
      // last row it would otherwise poke past the panel's edge, and the panel
      // scrolls — a scrollbar would flash for as long as the slide lasts.
      className={cn(menuRowClasses, 'overflow-hidden', className)}
      onSelect={(event) => {
        event.preventDefault();
        press();
        onToggle?.();
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        ignoreSecondaryRelease(event);
      }}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {badge}
        <MenuToggleBox checked={checked} pressed={pressed} />
      </span>
    </ContextMenuPrimitive.CheckboxItem>
  );
});

/**
 * Holds a set of choice rows. The panel lines its rows up at the start rather
 * than stretching them, so the group spans the panel itself and spaces its
 * rows as the panel does — otherwise it would shrink to its longest label.
 */
const ContextMenuRadioGroup = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioGroup>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioGroup>
>(function ContextMenuRadioGroup({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.RadioGroup
      ref={ref}
      className={cn('flex w-full flex-col gap-y-1', className)}
      {...props}
    />
  );
});

/**
 * One of a set in a radio group, of which exactly one is in effect: that one
 * carries a tick before its icon. Picking a row closes the menu, as a command
 * does.
 */
const ContextMenuChoiceItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem> & {
    /** On the right, at 16px, as on every other row. */
    icon?: React.ReactNode;
  }
>(function ContextMenuChoiceItem({ className, children, icon, onPointerUp, ...props }, ref) {
  return (
    <ContextMenuPrimitive.RadioItem
      ref={ref}
      className={cn(menuRowClasses, className)}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        ignoreSecondaryRelease(event);
      }}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {/* Where a row's "Soon" tag would sit, so the icons stay in one column. */}
        <ContextMenuPrimitive.ItemIndicator className="flex items-center [&>svg]:size-3.5">
          <Check />
        </ContextMenuPrimitive.ItemIndicator>
        {icon && <MenuRowIcon>{icon}</MenuRowIcon>}
      </span>
    </ContextMenuPrimitive.RadioItem>
  );
});

/** How long a destructive row has to be held before it runs. */
const HOLD_MS = 1000;

type HoldItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>,
  'onSelect' | 'children'
> & {
  label: string;
  /** Replaces the label for as long as the row is held. */
  holdingLabel?: string;
  icon?: React.ReactNode;
  /** Runs once the hold completes. The caller closes the menu. */
  onConfirm: () => void;
};

/**
 * A row that runs only after being held down, with a bar filling behind it.
 * Enter and Space hold it the same way a press does. A click does nothing,
 * so it can't be run by a slip.
 */
const ContextMenuHoldItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  HoldItemProps
>(function ContextMenuHoldItem(
  {
    className,
    label,
    holdingLabel = 'Hold to confirm',
    icon,
    onConfirm,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onKeyDown,
    onKeyUp,
    ...props
  },
  ref,
) {
  const [holding, setHolding] = React.useState(false);
  // Read when the fill finishes, which is after the render that started it.
  const holdingRef = React.useRef(false);
  const confirmedRef = React.useRef(false);

  const start = () => {
    holdingRef.current = true;
    confirmedRef.current = false;
    setHolding(true);
  };
  const end = () => {
    holdingRef.current = false;
    setHolding(false);
  };

  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      textValue={label}
      className={cn(
        menuRowClasses,
        'group h-7 justify-end overflow-hidden text-red-400 data-[highlighted]:bg-red-500/5 dark:data-[highlighted]:bg-red-500/20',
        className,
      )}
      // A click would otherwise close the menu having done nothing.
      onSelect={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.button === 0) start();
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        ignoreSecondaryRelease(event);
        end();
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        end();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) start();
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event);
        if (event.key === 'Enter' || event.key === ' ') end();
      }}
      {...props}
    >
      <AnimatePresence>
        <motion.span
          key={holding ? 'holding' : 'idle'}
          {...menuSlide}
          className="absolute left-0 ml-2 select-none"
        >
          {holding ? holdingLabel : label}
        </motion.span>
      </AnimatePresence>
      {icon && <MenuRowIcon>{icon}</MenuRowIcon>}
      <div className="absolute left-0 hidden h-full w-full bg-red-500/10 transition-colors group-data-[highlighted]:block dark:bg-red-500/25">
        <motion.div
          className="h-full bg-red-500/25"
          initial={{ width: 0 }}
          animate={{ width: holding ? '100%' : 0 }}
          transition={holding ? { duration: HOLD_MS / 1000, ease: 'linear' } : { duration: 0 }}
          onAnimationComplete={() => {
            if (!holdingRef.current || confirmedRef.current) return;
            confirmedRef.current = true;
            onConfirm();
          }}
        />
      </div>
    </ContextMenuPrimitive.Item>
  );
});

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger>
>(function ContextMenuSubTrigger({ className, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(menuRowClasses, menuSubTriggerClasses, className)}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <MenuRowEnd icon={<ChevronRight />} />
    </ContextMenuPrimitive.SubTrigger>
  );
});

/**
 * Portalled like the root panel rather than nested in it. The root scrolls,
 * and a submenu left inside it would be clipped to that scroll box — the
 * popper wrapper's transform makes it the submenu's containing block, which
 * puts the scroll box between the two.
 */
const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent> & {
    container?: HTMLElement | null;
  }
>(function ContextMenuSubContent({ className, container, children, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Portal container={container ?? undefined}>
      <ContextMenuPrimitive.SubContent
        ref={ref}
        className={cn(panelClasses, className)}
        onContextMenu={(event) => event.preventDefault()}
        {...props}
      >
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
});

/** A quiet caption over the rows below it. */
const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>
>(function ContextMenuLabel({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Label ref={ref} className={cn(menuLabelClasses, className)} {...props} />
  );
});

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function ContextMenuSeparator({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      className={cn(menuSeparatorClasses, className)}
      {...props}
    />
  );
});

const ContextMenuBadge = MenuBadge;

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuToggleItem,
  ContextMenuRadioGroup,
  ContextMenuChoiceItem,
  ContextMenuHoldItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuBadge,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
};
