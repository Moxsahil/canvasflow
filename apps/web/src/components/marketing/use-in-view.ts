'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reports the first time an element scrolls into view, and stays true after.
 * Sections use it to run their entrance animation once rather than on every
 * pass, so scrolling back up doesn't replay them.
 */
export function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) setInView(true);
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, inView };
}
