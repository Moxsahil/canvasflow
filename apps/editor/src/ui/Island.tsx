import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@canvasflow/ui';
import './Island.css';

interface IslandProps {
  children: ReactNode;
  /** Padding in `--space-factor` units — `padding={2}` is 0.5rem. */
  padding?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The floating card every piece of editor chrome sits on: background, radius
 * and shadow, nothing else. Positioning is the caller's job — an Island only
 * knows how to look like one.
 */
export const Island = forwardRef<HTMLDivElement, IslandProps>(function Island(
  { children, padding = 0, className, style },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('cf-island', className)}
      style={{ '--padding': padding, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
});
