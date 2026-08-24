import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /**
     * Where to portal the popup. Defaults to `document.body`, which for the
     * editor means landing *outside* `.cf-editor` — and every colour here is a
     * token declared on that element, so a body-level popup would paint with
     * empty `var()`s. Callers inside the editor pass the editor root.
     */
    container?: HTMLElement | null;
  }
>(function PopoverContent(
  { className, align = 'center', sideOffset = 4, container, ...props },
  ref,
) {
  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-(--zIndex-popup) w-72 overflow-hidden rounded-lg border border-sidebar-border bg-sidebar p-4 text-sidebar-foreground shadow-lg outline-hidden data-[state=open]:animate-popup-in',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
