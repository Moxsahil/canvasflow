import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/** Lift on hover, and the squash on press. */
const ITEM_SPRING = { type: 'spring', stiffness: 300, damping: 24 } as const;
/** The tooltip slides between items rather than reappearing at each one. */
const TOOLTIP_SPRING = { type: 'spring', stiffness: 120, damping: 18 } as const;
/** How far above the surface the tooltip floats. */
const TOOLTIP_OFFSET = -54;

interface HoverTarget {
  key: string;
  label: string;
  /** Centre of the item, in pixels from the surface's left edge. */
  center: number;
}

interface GlassDockContextValue {
  hoveredKey: string | null;
  onEnter: (key: string, label: string, el: HTMLElement | null) => void;
}

const GlassDockContext = createContext<GlassDockContextValue | null>(null);

function useGlassDock(): GlassDockContextValue {
  const context = useContext(GlassDockContext);
  if (!context) throw new Error('GlassDock parts must be rendered inside a <GlassDock>');
  return context;
}

interface GlassDockProps {
  children: ReactNode;
  'aria-label': string;
  className?: string;
}

/**
 * The bottom dock: a single frosted bar holding every on-canvas editing
 * control, with a tooltip that slides along above it as the pointer moves
 * between items.
 *
 * The dock owns hover and the tooltip only. Selected-ness belongs to the
 * controls inside it — the tools are a radio group whose choice has to persist
 * after the pointer leaves, which hover state cannot express.
 */
export function GlassDock({ children, 'aria-label': ariaLabel, className }: GlassDockProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const lastTargetRef = useRef<HoverTarget | null>(null);
  const [target, setTarget] = useState<HoverTarget | null>(null);
  /** 1 when the pointer moved right along the dock, -1 when it moved left. */
  const [direction, setDirection] = useState(0);

  const onEnter = useCallback((key: string, label: string, el: HTMLElement | null) => {
    const surface = surfaceRef.current;
    if (!el || !surface) return;

    // Measured rather than derived from the item's index: items are not all
    // the same width (the separator sits between them, and a group can be
    // hidden entirely in read-only mode), so an index times a fixed pitch
    // drifts out of alignment as soon as the dock's contents change.
    const itemBox = el.getBoundingClientRect();
    const surfaceBox = surface.getBoundingClientRect();
    const center = itemBox.left - surfaceBox.left + itemBox.width / 2;

    const previous = lastTargetRef.current;
    if (previous?.key === key) return;

    // Tracked in a ref alongside the state: deriving the slide direction needs
    // the previous centre, and reading it from a setState updater would run
    // this comparison twice under StrictMode's double-invoked updaters.
    lastTargetRef.current = { key, label, center };
    if (previous) setDirection(center > previous.center ? 1 : -1);
    setTarget({ key, label, center });
  }, []);

  const clear = useCallback(() => {
    lastTargetRef.current = null;
    setTarget(null);
    setDirection(0);
  }, []);

  const context = useMemo<GlassDockContextValue>(
    () => ({ hoveredKey: target?.key ?? null, onEnter }),
    [target?.key, onEnter],
  );

  return (
    <GlassDockContext.Provider value={context}>
      <div
        ref={surfaceRef}
        aria-label={ariaLabel}
        onMouseLeave={clear}
        // Focus moving out of the dock entirely, not between two items in it.
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) clear();
        }}
        className={cn(
          'relative flex items-center gap-1 rounded-2xl px-2 py-1.5',
          'border border-(--dock-border-color) bg-(--dock-bg-color) shadow-(--dock-shadow)',
          'backdrop-blur-xl backdrop-saturate-150',
          className,
        )}
      >
        <AnimatePresence>
          {target && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 8, x: target.center }}
              animate={{ opacity: 1, scale: 1, y: TOOLTIP_OFFSET, x: target.center }}
              exit={{ opacity: 0, scale: 0.92, y: 8 }}
              transition={TOOLTIP_SPRING}
              className="pointer-events-none absolute left-0 top-0 z-30"
            >
              {/* Nested so the half-width centring shift and framer-motion's
                  `x` don't both try to own this element's transform. */}
              <div className="-translate-x-1/2">
                <div className="flex min-w-20 items-center justify-center rounded-(--border-radius-lg) bg-(--dock-tooltip-bg) px-4 py-1.5 text-(--dock-tooltip-fg) shadow-(--dock-shadow)">
                  <div className="relative flex h-4 w-full items-center justify-center overflow-hidden">
                    <AnimatePresence mode="popLayout" custom={direction}>
                      <motion.span
                        key={target.key}
                        custom={direction}
                        initial={{ x: direction > 0 ? 28 : -28, opacity: 0, filter: 'blur(6px)' }}
                        animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
                        exit={{ x: direction > 0 ? -28 : 28, opacity: 0, filter: 'blur(6px)' }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        className="whitespace-nowrap text-[13px] font-medium tracking-wide"
                      >
                        {target.label}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {children}
      </div>
    </GlassDockContext.Provider>
  );
}

interface GlassDockItemProps {
  /** Stable identity for the tooltip; unique within one dock. */
  id: string;
  /** Shown in the tooltip. The control inside still needs its own label. */
  label: string;
  children: ReactNode;
}

/**
 * One magnifying slot in the dock. It wraps a control rather than being one,
 * so the tools keep their radio semantics and undo/redo stay real buttons.
 */
export function GlassDockItem({ id, label, children }: GlassDockItemProps) {
  const { hoveredKey, onEnter } = useGlassDock();
  const ref = useRef<HTMLDivElement>(null);
  const hovered = hoveredKey === id;

  const show = useCallback(() => onEnter(id, label, ref.current), [id, label, onEnter]);

  return (
    <motion.div
      ref={ref}
      onMouseEnter={show}
      // Keyboard users get the same tooltip; you cannot hover with arrow keys,
      // and the tools are navigated with them.
      onFocus={show}
      animate={{ scale: hovered ? 1.1 : 1, y: hovered ? -3 : 0 }}
      whileTap={{ scale: 0.95 }}
      transition={ITEM_SPRING}
      className="relative flex items-center justify-center"
    >
      {children}
    </motion.div>
  );
}

/** Hairline between two groups of dock items. */
export function GlassDockSeparator() {
  return <div aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-(--dock-separator-color)" />;
}

/** A run of related items — kept together so the separator has something to sit between. */
export function GlassDockGroup({
  children,
  ...props
}: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="flex items-center gap-1" {...props}>
      {children}
    </div>
  );
}
