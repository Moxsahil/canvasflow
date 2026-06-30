import { useState, useEffect, type RefObject } from 'react';

export interface CanvasSize {
  width: number;
  height: number;
}

export function useCanvasResize(containerRef: RefObject<HTMLElement | null>): CanvasSize {
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });

    observer.observe(el);

    // Initial size

    const rect = el.getBoundingClientRect();
    setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    return () => observer.disconnect();
  }, [containerRef]);

  return size;
}
