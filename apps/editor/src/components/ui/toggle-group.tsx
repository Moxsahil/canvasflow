'use client';

import * as React from 'react';
import { Toggle } from '@base-ui-components/react/toggle';
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui-components/react/toggle-group';

import { mergeClassName } from '@/lib/base-ui';

/**
 * A row of mutually exclusive toggle buttons. Single-select by default — pass
 * `multiple` for a group where several can be pressed at once.
 */
export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupPrimitive.Props>(
  function ToggleGroup({ className, ...props }, ref) {
    return (
      <ToggleGroupPrimitive
        ref={ref}
        className={mergeClassName(
          'flex items-center gap-1 rounded-ele border border-border p-1',
          className,
        )}
        data-slot="toggle-group"
        {...props}
      />
    );
  },
);

/**
 * One button in a `ToggleGroup`. Pressed state comes from the group, and is
 * styled off `aria-pressed` so it reads the same to assistive tech and to CSS.
 */
export const ToggleGroupItem = React.forwardRef<HTMLButtonElement, Toggle.Props>(
  function ToggleGroupItem({ className, ...props }, ref) {
    return (
      <Toggle
        ref={ref}
        className={mergeClassName(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-ele text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
          className,
        )}
        data-slot="toggle-group-item"
        {...props}
      />
    );
  },
);
