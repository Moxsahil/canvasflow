import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import { cn } from '@/lib/utils';

/** How long a toast stays up. */
export const TOAST_DURATION_MS = 3000;

/** Between the toast and the zoom panel under it. */
const TOAST_GAP = 8;
/** From the board's bottom edge, with no zoom panel to stand on. */
const TOAST_EDGE = 16;

export interface ToastMessage {
  /** Changes with every toast, so the same words twice still start afresh. */
  readonly id: number;
  readonly text: string;
}

/**
 * One toast at a time: `show` puts it up, and it takes itself down after
 * `TOAST_DURATION_MS`. Showing another while one is up replaces it and starts
 * the time again, rather than stacking.
 */
export function useToast(): { toast: ToastMessage | null; show: (text: string) => void } {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(0);

  const show = useCallback((text: string) => {
    nextId.current += 1;
    setToast({ id: nextId.current, text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, show };
}

/**
 * A word that something worked, in the menus' look, just above the zoom
 * panel at the bottom-right of the board — or in that corner itself when the
 * panel is away (focus and view mode, a narrow window).
 *
 * For news that needs nothing back: it takes no clicks and goes by itself.
 * Anything that asks for a choice, or carries something to act on, is a
 * notice instead.
 */
export function Toast({ toast }: { toast: ToastMessage | null }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState(TOAST_EDGE);

  // Measured as each toast goes up, from wherever the panel is at the time.
  // Its height belongs to its own styles, and copying the number here would
  // leave the toast sitting on it, or floating, the day those change.
  useLayoutEffect(() => {
    const region = regionRef.current;
    const board = region?.offsetParent as HTMLElement | null | undefined;
    if (!toast || !board) return;
    const panel = board.querySelector<HTMLElement>('[data-zoom-panel]');
    setBottom(panel ? board.clientHeight - panel.offsetTop + TOAST_GAP : TOAST_EDGE);
  }, [toast]);

  return (
    <div
      ref={regionRef}
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute right-4 z-(--zIndex-popup) flex justify-end"
      style={{ bottom }}
    >
      <MotionConfig reducedMotion="user">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              data-testid="toast"
              className={cn(menuSurfaceClasses, 'flex h-9 items-center gap-2 px-3 text-xs')}
            >
              <Check aria-hidden="true" className="size-4 shrink-0" />
              <span>{toast.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
