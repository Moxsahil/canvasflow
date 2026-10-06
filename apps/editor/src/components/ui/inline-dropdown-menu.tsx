import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { MotionConfig } from 'framer-motion';
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
  menuSubTriggerClasses,
  useMenuPress,
} from './menu-look';

/**
 * A dropdown in the editor's menu look — the one the context menu wears — for
 * the sidebar's menus. The plain `dropdown-menu` keeps the theme-token look
 * for everything else that still uses it.
 */
const InlineDropdownMenu = DropdownMenuPrimitive.Root;
const InlineDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const InlineDropdownMenuSub = DropdownMenuPrimitive.Sub;
const InlineDropdownMenuBadge = MenuBadge;

/**
 * On closing, focus is not handed back to the button that opened the menu.
 *
 * Put there by script after a menu opened with the pointer, the browser takes
 * it for keyboard focus and draws the focus ring, which then stays on the rail
 * long after the menu is gone. A menu that wants focus somewhere — a field,
 * or its button inside a dialog — passes its own `onCloseAutoFocus`.
 */
function leaveTriggerUnfocused(event: Event) {
  event.preventDefault();
}

/** The shared panel, capped to the room the popper reports and scrolled past it. */
const panelClasses = cn(menuPanelClasses, 'max-h-(--radix-dropdown-menu-content-available-height)');

/** A row that opens a list of its own beside the menu, marked by its arrow. */
const InlineDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger>
>(function InlineDropdownMenuSubTrigger({ className, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      ref={ref}
      className={cn(menuRowClasses, menuSubTriggerClasses, className)}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <MenuRowEnd icon={<ChevronRight />} />
    </DropdownMenuPrimitive.SubTrigger>
  );
});

/**
 * Portalled like the root panel rather than nested in it, so the root's own
 * scroll box can never clip it.
 */
const InlineDropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> & {
    container?: HTMLElement | null;
  }
>(function InlineDropdownMenuSubContent({ className, container, children, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal container={container ?? undefined}>
      <DropdownMenuPrimitive.SubContent
        ref={ref}
        className={cn(panelClasses, className)}
        {...props}
      >
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
  );
});

const InlineDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    /**
     * Where to portal the popup. The theme is read off `.cf-editor`, so a popup
     * left at `<body>` would ignore the dark switch.
     */
    container?: HTMLElement | null;
  }
>(function InlineDropdownMenuContent(
  { className, container, children, onCloseAutoFocus = leaveTriggerUnfocused, ...props },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Portal container={container ?? undefined}>
      <DropdownMenuPrimitive.Content
        ref={ref}
        className={cn(panelClasses, className)}
        onCloseAutoFocus={onCloseAutoFocus}
        {...props}
      >
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
});

const InlineDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    /** On the right, at 16px. */
    icon?: React.ReactNode;
    /** A small tag just before the icon, such as "Soon". */
    badge?: React.ReactNode;
  }
>(function InlineDropdownMenuItem({ className, children, icon, badge, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item ref={ref} className={cn(menuRowClasses, className)} {...props}>
      <span className="min-w-0 truncate">{children}</span>
      <MenuRowEnd badge={badge} icon={icon} />
    </DropdownMenuPrimitive.Item>
  );
});

/**
 * A setting switched from the menu. The menu stays open, so the next one can
 * be ticked without reopening it, and the box can be seen to change.
 */
const InlineDropdownMenuToggleItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  Omit<
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>,
    'checked' | 'onCheckedChange' | 'onSelect'
  > & {
    checked: boolean;
    onToggle?: () => void;
    badge?: React.ReactNode;
  }
>(function InlineDropdownMenuToggleItem(
  { className, children, checked, onToggle, badge, ...props },
  ref,
) {
  const [pressed, press] = useMenuPress();

  return (
    <DropdownMenuPrimitive.CheckboxItem
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
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        {badge}
        <MenuToggleBox checked={checked} pressed={pressed} />
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  );
});

/** A set of rows of which exactly one is in effect. */
const InlineDropdownMenuRadioGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioGroup>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioGroup>
>(function InlineDropdownMenuRadioGroup({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      ref={ref}
      className={cn('flex w-full flex-col gap-y-1', className)}
      {...props}
    />
  );
});

/**
 * One of a radio group, as the context menu draws it: the one in effect
 * carries a tick before its icon. Picking a row closes the menu, as a command
 * does.
 */
const InlineDropdownMenuChoiceItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem> & {
    /** On the right, at 16px, as on every other row. */
    icon?: React.ReactNode;
  }
>(function InlineDropdownMenuChoiceItem({ className, children, icon, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.RadioItem ref={ref} className={cn(menuRowClasses, className)} {...props}>
      <span className="min-w-0 truncate">{children}</span>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <DropdownMenuPrimitive.ItemIndicator className="flex items-center [&>svg]:size-3.5">
          <Check />
        </DropdownMenuPrimitive.ItemIndicator>
        {icon && <MenuRowIcon>{icon}</MenuRowIcon>}
      </span>
    </DropdownMenuPrimitive.RadioItem>
  );
});

/** A quiet caption over the rows below it. */
const InlineDropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function InlineDropdownMenuLabel({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Label ref={ref} className={cn(menuLabelClasses, className)} {...props} />
  );
});

const InlineDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function InlineDropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn(menuSeparatorClasses, className)}
      {...props}
    />
  );
});

export {
  InlineDropdownMenu,
  InlineDropdownMenuTrigger,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuToggleItem,
  InlineDropdownMenuRadioGroup,
  InlineDropdownMenuChoiceItem,
  InlineDropdownMenuLabel,
  InlineDropdownMenuSeparator,
  InlineDropdownMenuBadge,
  InlineDropdownMenuSub,
  InlineDropdownMenuSubTrigger,
  InlineDropdownMenuSubContent,
};
