import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * shadcn's Button, with the palette re-pointed at the editor's theme tokens
 * (see styles/theme.css) instead of shadcn's own `--primary`/`--accent` set —
 * that way a button inside the editor follows light/dark with the rest of the
 * chrome, and there is still only one place colours are defined.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-(--border-radius-md) text-sm font-medium transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-(--color-surface-primary-container) text-(--color-on-primary-container) hover:brightness-[0.97]',
        outline:
          'border border-(--default-border-color) bg-transparent hover:bg-(--button-hover-bg)',
        ghost: 'hover:bg-(--button-hover-bg)',
        link: 'text-(--color-brand-active) underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});

export { Button, buttonVariants };
