import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@canvasflow/ui';
import './Stack.css';

interface StackProps {
  children: ReactNode;
  /** Gap in `--space-factor` units — `gap={1}` is 0.25rem. */
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
  className?: string;
  style?: CSSProperties;
}

const Row = forwardRef<HTMLDivElement, StackProps>(function Row(
  { children, gap = 0, align, justify, className, style },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('cf-stack', 'cf-stack--row', className)}
      style={
        { '--gap': gap, alignItems: align, justifyContent: justify, ...style } as CSSProperties
      }
    >
      {children}
    </div>
  );
});

const Col = forwardRef<HTMLDivElement, StackProps>(function Col(
  { children, gap = 0, align, justify, className, style },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('cf-stack', 'cf-stack--col', className)}
      style={
        { '--gap': gap, justifyItems: align, justifyContent: justify, ...style } as CSSProperties
      }
    >
      {children}
    </div>
  );
});

/** One-dimensional layout with a gap measured in `--space-factor` units. */
export const Stack = { Row, Col };
