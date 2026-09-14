'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

import { cn } from '@/lib/utils';

export interface MarqueeProps {
  children: React.ReactNode;
  /** Pixels travelled per second. Higher is faster. */
  speed?: number;
  className?: string;
  /** Space between items, in pixels. */
  gap?: number;
}

/**
 * A row that scrolls its children left forever.
 *
 * The children are laid out twice. The track travels exactly the width of the
 * first copy plus the gap, at which point the second copy is sitting where the
 * first one started, so the loop restarts on an identical frame and the seam
 * never shows.
 *
 * That distance is measured rather than assumed, which is what lets `speed`
 * mean pixels per second instead of an arbitrary dial: a row of four logos and
 * a row of twenty then travel at the same pace. A ResizeObserver re-measures,
 * so a late-loading logo or a font swap cannot leave the loop mistimed.
 *
 * The second copy is hidden from assistive tech — it is the same content, and a
 * screen reader should hear the list once.
 */
export function Marquee({ children, speed = 40, className, gap = 16 }: MarqueeProps) {
  const firstCopyRef = React.useRef<HTMLDivElement>(null);
  const [distance, setDistance] = React.useState(0);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    const el = firstCopyRef.current;
    if (!el) return;

    const measure = () => setDistance(el.offsetWidth + gap);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, gap]);

  // Nothing to animate until the row has been measured, and nothing should
  // animate at all for someone who has asked for less movement.
  const shouldAnimate = distance > 0 && !reduceMotion;

  return (
    <div className={cn('relative w-full overflow-hidden', className)}>
      <motion.div
        className="flex w-max items-center"
        style={{ gap }}
        animate={shouldAnimate ? { x: [0, -distance] } : undefined}
        transition={
          shouldAnimate
            ? { duration: distance / speed, ease: 'linear', repeat: Infinity, repeatType: 'loop' }
            : undefined
        }
      >
        <div ref={firstCopyRef} className="flex shrink-0 items-center" style={{ gap }}>
          {children}
        </div>
        <div className="flex shrink-0 items-center" style={{ gap }} aria-hidden="true">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

export default Marquee;
