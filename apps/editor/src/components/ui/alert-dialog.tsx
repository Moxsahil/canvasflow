import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * Animated alert dialog: Radix for the behaviour (focus trap, scroll lock,
 * Escape, `alertdialog` semantics) and Framer for a spring entrance that
 * staggers the header and footer in behind it.
 *
 * Two deliberate departures from the upstream component:
 *  - it animates with `framer-motion`, which the menu rail already pulls in,
 *    rather than adding the `motion` package as a second copy of the same
 *    library;
 *  - colours come from the editor's theme tokens instead of shadcn's
 *    `--background`/`--muted` set, which this project doesn't define — see
 *    styles/theme.css.
 */

type AlertDialogContextValue = {
  open: boolean;
  reduceMotion: boolean;
  /** Where the portal mounts — see AlertDialogContent for why it matters. */
  container?: HTMLElement | null;
};

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

function useAlertDialogContext() {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error('AlertDialog components must be used within AlertDialog.');
  }
  return context;
}

const overlayTransition = {
  duration: 0.24,
  ease: [0.16, 1, 0.3, 1],
} as const;

function getContentVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0, y: 12 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] } },
      exit: { opacity: 0, y: 8, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
    };
  }

  return {
    hidden: { opacity: 0, scale: 0.9, y: 26, filter: 'blur(10px)' },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        type: 'spring',
        stiffness: 280,
        damping: 24,
        mass: 0.92,
        staggerChildren: 0.055,
        delayChildren: 0.04,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.96,
      y: 12,
      filter: 'blur(4px)',
      transition: { type: 'spring', stiffness: 340, damping: 28, mass: 0.86 },
    },
  };
}

function getChildVariants(reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.14 } },
      exit: { opacity: 0, transition: { duration: 0.1 } },
    };
  }

  return {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 300, damping: 24, mass: 0.82 },
    },
    exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } },
  };
}

const buttonBase =
  'inline-flex min-h-9 items-center justify-center rounded-(--border-radius-md) px-3.5 py-2 font-medium text-[0.8125rem] tracking-[-0.01em] transition-[transform,background-color,filter] duration-200 focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50';

export interface AlertDialogProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  /** Force the reduced-motion variants regardless of the OS setting. */
  reducedMotion?: boolean;
  /**
   * Element to portal the dialog into. Defaults to `document.body`, which in
   * this app means landing outside `.cf-editor` — where none of the theme
   * tokens resolve. Pass the editor root to keep the dialog themed.
   */
  container?: HTMLElement | null;
}

function AlertDialog({
  children,
  defaultOpen = false,
  onOpenChange,
  open: openProp,
  reducedMotion,
  container,
  ...props
}: AlertDialogProps) {
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = isControlled ? openProp : uncontrolledOpen;
  const prefersReducedMotion = useReducedMotion() ?? false;
  const reduceMotion = Boolean(reducedMotion || prefersReducedMotion);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <AlertDialogContext.Provider value={{ open, reduceMotion, container }}>
        <AlertDialogPrimitive.Root
          {...props}
          defaultOpen={defaultOpen}
          onOpenChange={handleOpenChange}
          open={open}
        >
          {children}
        </AlertDialogPrimitive.Root>
      </AlertDialogContext.Provider>
    </MotionConfig>
  );
}

const AlertDialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function AlertDialogTrigger({ className, type = 'button', ...props }, ref) {
  return (
    <AlertDialogPrimitive.Trigger
      className={cn(
        buttonBase,
        'bg-(--color-surface-primary-container) text-(--color-on-primary-container) hover:-translate-y-px hover:brightness-[0.97] active:translate-y-0',
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});

const AlertDialogContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function AlertDialogContent({ children, className, ...props }, ref) {
    const { open, reduceMotion, container } = useAlertDialogContext();
    const contentVariants = getContentVariants(reduceMotion);
    const childVariants = getChildVariants(reduceMotion);
    // React's DOM animation/drag handlers collide with Framer's props of the
    // same name, so they're peeled off rather than forwarded.
    const {
      onAnimationEnd: _onAnimationEnd,
      onAnimationIteration: _onAnimationIteration,
      onAnimationStart: _onAnimationStart,
      onDrag: _onDrag,
      onDragEnd: _onDragEnd,
      onDragStart: _onDragStart,
      ...resolvedProps
    } = props;

    return (
      <AnimatePresence initial={false}>
        {open ? (
          <AlertDialogPrimitive.Portal forceMount container={container ?? undefined}>
            <AlertDialogPrimitive.Overlay asChild forceMount>
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-(--zIndex-modal) bg-black/50 backdrop-blur-[10px]"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={
                  reduceMotion ? { duration: 0.14, ease: [0.4, 0, 1, 1] } : overlayTransition
                }
              />
            </AlertDialogPrimitive.Overlay>
            <AlertDialogPrimitive.Content
              className="fixed inset-0 z-(--zIndex-modal) grid place-items-center overflow-y-auto p-4 outline-none"
              forceMount
            >
              <motion.div
                animate="visible"
                className={cn(
                  'relative flex w-[min(100%,28rem)] flex-col gap-5 rounded-[12px] border border-(--default-border-color) bg-(--island-bg-color) p-6 text-(--text-primary-color) shadow-[0_32px_120px_rgb(0_0_0/0.28)]',
                  className,
                )}
                exit="exit"
                initial="hidden"
                ref={ref}
                variants={contentVariants}
                {...resolvedProps}
              >
                {React.Children.map(children, (child) =>
                  child == null ? null : <motion.div variants={childVariants}>{child}</motion.div>,
                )}
              </motion.div>
            </AlertDialogPrimitive.Content>
          </AlertDialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    );
  },
);

function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-2 text-left', className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

const AlertDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(function AlertDialogTitle({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Title
      className={cn(
        'font-semibold text-[1.125rem] text-(--text-primary-color) leading-tight tracking-[-0.02em]',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

const AlertDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(function AlertDialogDescription({ className, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('max-w-[46ch] text-[0.8125rem] leading-6', className)}
      ref={ref}
      {...props}
    />
  );
});

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function AlertDialogCancel({ className, type = 'button', ...props }, ref) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(
        buttonBase,
        'border border-(--default-border-color) bg-transparent text-(--text-primary-color) hover:bg-(--button-hover-bg)',
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});

const AlertDialogAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { destructive?: boolean }
>(function AlertDialogAction({ className, type = 'button', destructive = false, ...props }, ref) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(
        buttonBase,
        'hover:-translate-y-px active:translate-y-0 hover:brightness-[0.95] active:brightness-90',
        destructive
          ? 'bg-(--color-danger) text-white'
          : 'bg-(--color-surface-primary-container) text-(--color-on-primary-container)',
        className,
      )}
      ref={ref}
      type={type}
      {...props}
    />
  );
});

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
