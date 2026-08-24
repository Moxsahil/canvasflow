'use client';

import * as React from 'react';
import { Toolbar as ToolbarPrimitive } from '@base-ui-components/react/toolbar';

import { mergeClassName } from '@/lib/base-ui';

/* Every part forwards its ref: this app is on React 18, where a ref only
   reaches the element through `forwardRef`, and both Base UI's `render` prop
   and Radix's `asChild` compose these parts by handing them one. */

export const Toolbar = React.forwardRef<HTMLDivElement, ToolbarPrimitive.Root.Props>(
  function Toolbar({ className, ...props }, ref) {
    return (
      <ToolbarPrimitive.Root
        ref={ref}
        className={mergeClassName(
          // `border-border` is spelled out because this app has no base layer
          // colouring every border, unlike a stock shadcn setup.
          'relative flex gap-2 rounded-xl border border-border bg-card p-1 text-card-foreground',
          className,
        )}
        data-slot="toolbar"
        {...props}
      />
    );
  },
);

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarPrimitive.Button.Props>(
  function ToolbarButton({ className, ...props }, ref) {
    return (
      <ToolbarPrimitive.Button
        ref={ref}
        className={className}
        data-slot="toolbar-button"
        {...props}
      />
    );
  },
);

export const ToolbarLink = React.forwardRef<HTMLAnchorElement, ToolbarPrimitive.Link.Props>(
  function ToolbarLink({ className, ...props }, ref) {
    return (
      <ToolbarPrimitive.Link ref={ref} className={className} data-slot="toolbar-link" {...props} />
    );
  },
);

export const ToolbarInput = React.forwardRef<HTMLInputElement, ToolbarPrimitive.Input.Props>(
  function ToolbarInput({ className, ...props }, ref) {
    return (
      <ToolbarPrimitive.Input
        ref={ref}
        className={className}
        data-slot="toolbar-input"
        {...props}
      />
    );
  },
);

export const ToolbarGroup = React.forwardRef<HTMLDivElement, ToolbarPrimitive.Group.Props>(
  function ToolbarGroup({ className, ...props }, ref) {
    return (
      <ToolbarPrimitive.Group
        ref={ref}
        className={mergeClassName('flex items-center gap-1', className)}
        data-slot="toolbar-group"
        {...props}
      />
    );
  },
);

export const ToolbarSeparator = React.forwardRef<HTMLDivElement, ToolbarPrimitive.Separator.Props>(
  function ToolbarSeparator({ className, ...props }, ref) {
    return (
      <ToolbarPrimitive.Separator
        ref={ref}
        className={mergeClassName(
          'shrink-0 self-stretch bg-border data-[orientation=horizontal]:my-0.5 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:my-1.5 data-[orientation=vertical]:w-px',
          className,
        )}
        data-slot="toolbar-separator"
        {...props}
      />
    );
  },
);

export { ToolbarPrimitive };

export default Toolbar;
