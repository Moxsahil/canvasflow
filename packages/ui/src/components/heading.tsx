import { cva, type VariantProps } from 'class-variance-authority';
import { type HTMLAttributes, createElement, forwardRef } from 'react';
import { cn } from '../lib/cn.js';

const headingVariants = cva('font-semibold text-zinc-900 tracking-tight', {
  variants: {
    level: {
      1: 'text-4xl',
      2: 'text-3xl',
      3: 'text-2xl',
      4: 'text-xl',
      5: 'text-lg',
      6: 'text-base',
    },
  },
  defaultVariants: {
    level: 2,
  },
});

export interface HeadingProps
  extends HTMLAttributes<HTMLHeadingElement>, VariantProps<typeof headingVariants> {
  /** Render as a different heading tag than the visual level implies. */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { className, level = 2, as, ...props },
  ref,
) {
  const tag = as ?? (`h${level}` as const);
  return createElement(tag, {
    ref,
    className: cn(headingVariants({ level }), className),
    ...props,
  });
});
