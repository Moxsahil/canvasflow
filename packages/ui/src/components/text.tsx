import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../lib/cn.js';

const textVariants = cva('', {
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
    },
    tone: {
      default: 'text-zinc-900',
      secondary: 'text-zinc-600',
      muted: 'text-zinc-500',
      brand: 'text-brand-600',
      danger: 'text-red-600',
    },
    weight: {
      regular: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  defaultVariants: {
    size: 'base',
    tone: 'default',
    weight: 'regular',
  },
});

export interface TextProps
  extends HTMLAttributes<HTMLParagraphElement>, VariantProps<typeof textVariants> {}

export const Text = forwardRef<HTMLParagraphElement, TextProps>(function Text(
  { className, size, tone, weight, ...props },
  ref,
) {
  return <p ref={ref} className={cn(textVariants({ size, tone, weight }), className)} {...props} />;
});
