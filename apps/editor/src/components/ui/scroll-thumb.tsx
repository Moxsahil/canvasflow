import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A slim scroll bar drawn by the page, for a list whose own bar is hidden:
 * a rounded thumb on no track, in the menus' neutral palette, that can be
 * dragged. The browser's bar cannot be counted on to look like this — on
 * Windows it keeps its arrow buttons whatever it is told.
 *
 * Goes beside the list, inside a positioned box the list fills. Shows only
 * when the list has more than fits.
 */
export function ScrollThumb({
  target,
  className,
}: {
  target: React.RefObject<HTMLElement | null>;
  className?: string;
}) {
  const [thumb, setThumb] = React.useState<{ top: number; height: number } | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef<{ startY: number; startScroll: number } | null>(null);

  React.useLayoutEffect(() => {
    const list = target.current;
    if (!list) return;
    const measure = () => {
      const { scrollHeight, clientHeight, scrollTop } = list;
      if (scrollHeight <= clientHeight + 1) {
        setThumb(null);
        return;
      }
      const inset = 4;
      const track = clientHeight - inset * 2;
      const height = Math.max(20, (clientHeight / scrollHeight) * track);
      const top = inset + (scrollTop / (scrollHeight - clientHeight)) * (track - height);
      setThumb({ top, height });
    };
    measure();
    list.addEventListener('scroll', measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(list);
    // Rows come and go as a search narrows the list.
    const changed = new MutationObserver(measure);
    changed.observe(list, { childList: true, subtree: true });
    return () => {
      list.removeEventListener('scroll', measure);
      resized.disconnect();
      changed.disconnect();
    };
  }, [target]);

  if (!thumb) return null;

  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute right-0.5 w-1.5 touch-none rounded-full bg-neutral-950/20 transition-colors hover:bg-neutral-950/35 dark:bg-neutral-50/20 dark:hover:bg-neutral-50/35',
        dragging && 'bg-neutral-950/35 dark:bg-neutral-50/35',
        className,
      )}
      style={{ top: thumb.top, height: thumb.height }}
      onPointerDown={(event) => {
        const list = target.current;
        if (!list) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { startY: event.clientY, startScroll: list.scrollTop };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const list = target.current;
        const drag = dragRef.current;
        if (!list || !drag) return;
        // The thumb moves through what is left of the track; the list moves
        // through what is left of itself, in proportion.
        const track = list.clientHeight - 8 - thumb.height;
        const room = list.scrollHeight - list.clientHeight;
        list.scrollTop = drag.startScroll + ((event.clientY - drag.startY) / track) * room;
      }}
      onPointerUp={() => {
        dragRef.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setDragging(false);
      }}
    />
  );
}
