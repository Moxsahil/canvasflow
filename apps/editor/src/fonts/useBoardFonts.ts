import { useEffect, useRef, useState } from 'react';
import { forgetTextLayouts, type Shape } from '@canvasflow/canvas-engine';
import './web-fonts';

/**
 * Loads the fonts the board's shapes are written in, and returns a number
 * that goes up each time a font arrives, for the canvases to repaint on.
 *
 * A canvas does not wait for a font: text drawn before it has downloaded is
 * drawn, and measured, in whatever stands in for it, and stays that way until
 * something repaints. So each stack is asked for outright, and when any font
 * finishes loading — this board's, or one the font list showed — what was
 * measured is forgotten and the board drawn again.
 */
export function useBoardFonts(shapes: readonly Shape[]): number {
  const [revision, setRevision] = useState(0);
  const askedRef = useRef(new Set<string>());

  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) return;
    const arrived = () => {
      forgetTextLayouts();
      setRevision((value) => value + 1);
    };
    fonts.addEventListener('loadingdone', arrived);
    return () => fonts.removeEventListener('loadingdone', arrived);
  }, []);

  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts) return;
    const asked = askedRef.current;
    for (const shape of shapes) {
      const stack = 'fontFamily' in shape ? shape.fontFamily : undefined;
      if (typeof stack !== 'string' || asked.has(stack)) continue;
      asked.add(stack);
      // A stack naming nothing served simply resolves with no fonts.
      void fonts.load(`16px ${stack}`).catch(() => {});
    }
  }, [shapes]);

  return revision;
}
