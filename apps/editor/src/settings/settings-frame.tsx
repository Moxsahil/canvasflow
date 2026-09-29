import { createContext, useContext, useEffect, useRef, type CSSProperties } from 'react';

/**
 * What the Settings window lends to the pages inside it.
 *
 * The window owns the header and Escape; a page owns what scrolls and what can
 * be backed out of. This is how the two talk without the window knowing what
 * any page holds.
 */
interface SettingsFrame {
  /** Called as a page scrolls, so the header can tuck itself away. */
  onPageScroll: (scroller: HTMLElement) => void;
  /**
   * Escape goes to the most recently added of these, and closes the window
   * once none is left. Returns the way to take it off again.
   */
  pushEscape: (handler: () => void) => () => void;
  /**
   * The palette and face the window paints with, for a dialog drawn outside
   * the window's own element.
   */
  surface: CSSProperties;
  /**
   * A dialog is up over the window: the window is out of reach until it goes,
   * and then focus goes back to `opener`. Returns the way to let go.
   */
  holdModal: (opener: HTMLElement | null) => () => void;
}

export const SettingsFrameContext = createContext<SettingsFrame | null>(null);

export function useSettingsFrame(): SettingsFrame | null {
  return useContext(SettingsFrameContext);
}

/**
 * Take Escape while `handler` is set: a dialog to close, an edit to undo,
 * a list of results to put away. Null hands it back.
 */
export function useEscape(handler: (() => void) | null) {
  const frame = useSettingsFrame();
  const latest = useRef(handler);
  latest.current = handler;
  const active = handler !== null;

  useEffect(() => {
    if (!frame || !active) return;
    return frame.pushEscape(() => latest.current?.());
  }, [frame, active]);
}

/**
 * What a group says about the last change made in it: that it saved, or why it
 * did not. Said beside the group's name, where the eye already is.
 */
export interface BandStatus {
  saved: () => void;
  failed: (message: string) => void;
  clear: () => void;
}

export const BandContext = createContext<BandStatus | null>(null);

export function useBand(): BandStatus | null {
  return useContext(BandContext);
}
