import { useEffect, useRef } from 'react';

/** Clears a row's own highlight, for a row the glide paints instead. */
export const glideRowClasses =
  'hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent data-[state=open]:bg-transparent data-[state=open]:hover:bg-transparent';

/**
 * One highlight for a list of boards: it glides to whichever row the pointer or
 * focus is on, and settles back on the open board when they leave. Goes first
 * in its list, so the rows paint over it; the list has to be positioned.
 */
export function BoardGlide() {
  const glide = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = glide.current;
    const list = el?.parentElement;
    if (!el || !list) return;

    let hovered: HTMLElement | null = null;
    let shown = false;

    const place = () => {
      const row =
        (hovered?.isConnected ? hovered : null) ??
        list.querySelector<HTMLElement>('[data-sidebar="menu-button"][data-active="true"]');
      if (!row) {
        shown = false;
        el.style.opacity = '0';
        return;
      }
      const box = row.getBoundingClientRect();
      const frame = list.getBoundingClientRect();
      // Arriving from nothing it appears in place, rather than sliding in from
      // wherever it last was.
      if (!shown) el.style.transition = 'none';
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      el.style.transform = `translate(${box.left - frame.left + list.scrollLeft - list.clientLeft}px, ${box.top - frame.top + list.scrollTop - list.clientTop}px)`;
      if (!shown) {
        void el.offsetHeight;
        el.style.transition = '';
      }
      el.style.opacity = '1';
      shown = true;
    };

    const rowOf = (target: EventTarget | null) =>
      target instanceof Element
        ? (target
            .closest('[data-sidebar="menu-item"]')
            ?.querySelector<HTMLElement>('[data-sidebar="menu-button"]') ?? null)
        : null;
    const enter = (event: Event) => {
      hovered = rowOf(event.target);
      place();
    };
    const leave = () => {
      hovered = null;
      place();
    };

    list.addEventListener('pointerover', enter);
    list.addEventListener('pointerleave', leave);
    list.addEventListener('focusin', enter);
    list.addEventListener('focusout', leave);
    const changes = new MutationObserver(place);
    changes.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-active'],
    });
    // The sidebar collapsing to its rail, or being dragged wider.
    const resize = new ResizeObserver(place);
    resize.observe(list);
    place();

    return () => {
      list.removeEventListener('pointerover', enter);
      list.removeEventListener('pointerleave', leave);
      list.removeEventListener('focusin', enter);
      list.removeEventListener('focusout', leave);
      changes.disconnect();
      resize.disconnect();
    };
  }, []);

  return (
    <li
      ref={glide}
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 rounded-md bg-sidebar-accent opacity-0 transition-[transform,opacity,width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
    />
  );
}
