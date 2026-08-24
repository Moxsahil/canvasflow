import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cva, type VariantProps } from 'class-variance-authority';
import { type LucideIcon, ChevronDown, Check } from 'lucide-react';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';

const selectTriggerVariants = cva(
  'flex h-9 w-full items-center justify-between gap-3 rounded-ele border border-border bg-input px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
  {
    variants: {
      variant: {
        default: 'hover:bg-accent hover:text-accent-foreground shadow-sm/2',
        outline: 'border-2 hover:border-ring shadow-sm/2',
        ghost: 'border-transparent hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        sm: 'h-8 p-2 text-xs gap-2',
        default: 'h-9 p-3 gap-3',
        lg: 'h-10 p-4 text-base gap-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

// The editor's own ladder rather than z-50: this opens from inside a dialog,
// which sits at the modal level, and a popup underneath its overlay is no
// popup at all.
const selectContentVariants = cva(
  'relative z-(--zIndex-modal) max-h-[300px] min-w-[8rem] overflow-hidden rounded-ele border border-border bg-background text-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
  {
    variants: {
      position: {
        popper:
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        'item-aligned': '',
      },
    },
    defaultVariants: {
      position: 'popper',
    },
  },
);

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Value>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value> & {
    placeholder?: string;
  }
>(function SelectValue({ className, placeholder, ...props }, ref) {
  return (
    <SelectPrimitive.Value
      ref={ref}
      className={cn('select-none text-sm', className)}
      placeholder={
        placeholder && <span className="select-none text-muted-foreground">{placeholder}</span>
      }
      {...props}
    />
  );
});

interface SelectTriggerProps
  extends
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {
  icon?: LucideIcon;
  placeholder?: string;
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(function SelectTrigger(
  { className, children, variant, size, icon: Icon, placeholder: _placeholder, ...props },
  ref,
) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn('group', selectTriggerVariants({ variant, size }), className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {Icon && <Icon size={16} className="shrink-0 text-muted-foreground" />}
        <span className="truncate">{children}</span>
      </div>{' '}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          size={16}
          className="shrink-0 opacity-50 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

interface SelectContentProps extends React.ComponentPropsWithoutRef<
  typeof SelectPrimitive.Content
> {
  position?: 'popper' | 'item-aligned';
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  container?: HTMLElement | null;
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(function SelectContent({ className, children, position = 'popper', container, ...props }, ref) {
  return (
    <SelectPrimitive.Portal container={container ?? undefined}>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(selectContentVariants({ position }), className)}
        position={position}
        {...props}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
        >
          <SelectPrimitive.Viewport
            className={cn(
              'max-h-[280px] overflow-y-auto p-2',
              position === 'popper' && 'h-fit w-full min-w-[var(--radix-select-trigger-width)]',
            )}
          >
            {children}
          </SelectPrimitive.Viewport>
        </motion.div>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn('px-3 py-2 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
});

interface SelectItemProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  icon?: LucideIcon;
}

const SelectItem = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Item>, SelectItemProps>(
  function SelectItem({ className, children, icon: Icon, ...props }, ref) {
    return (
      <SelectPrimitive.Item
        ref={ref}
        className={cn(
          'relative flex w-full cursor-default select-none items-center rounded-lg py-2 pl-3 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground data-[disabled]:opacity-50',
          className,
        )}
        {...props}
      >
        <motion.div
          className="flex w-full items-center gap-2"
          whileHover={{ x: 2 }}
          transition={{ duration: 0.1 }}
        >
          {Icon && <Icon size={16} className="shrink-0" />}
          <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        </motion.div>
        <span className="absolute right-3 flex h-3.5 w-3.5 items-center justify-center">
          <SelectPrimitive.ItemIndicator>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.1 }}
            >
              <Check size={16} />
            </motion.div>
          </SelectPrimitive.ItemIndicator>
        </span>
      </SelectPrimitive.Item>
    );
  },
);

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 my-1 h-px bg-muted', className)}
      {...props}
    />
  );
});

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  selectTriggerVariants,
};
