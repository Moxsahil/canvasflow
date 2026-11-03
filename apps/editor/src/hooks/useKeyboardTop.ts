import { useEffect, useState } from 'react';

/**
 * Below this, a shrunken visual viewport is the browser's own bars moving,
 * not a keyboard.
 */
const KEYBOARD_MIN_HEIGHT = 120;

/**
 * Where an on-screen keyboard's top edge is, in layout pixels from the top of
 * the page, or null when no keyboard is up.
 *
 * The keyboard is the part of the window the visual viewport no longer shows
 * below it. Pure, so the rule can be tested without a phone.
 */
export function keyboardTop(
  windowHeight: number,
  viewport: { height: number; offsetTop: number },
): number | null {
  const visibleBottom = viewport.offsetTop + viewport.height;
  return windowHeight - visibleBottom >= KEYBOARD_MIN_HEIGHT ? visibleBottom : null;
}

/**
 * The on-screen keyboard's top edge, following it as it opens, closes and
 * changes height. Null on every device without one.
 */
export function useKeyboardTop(): number | null {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setTop(keyboardTop(window.innerHeight, viewport));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
    };
  }, []);
  return top;
}
