/**
 * A link to a board with the AI panel open: the board's address with
 * `?panel=ai`, which the editor reads once on load, opens the panel at, and
 * then takes off the address. The upgrade page's way back when the panel's
 * limit sent someone there.
 */
export const PANEL_PARAM = 'panel';
export const AI_PANEL = 'ai';

/** Whether this page was opened to show the AI panel, once, taking it off the address. */
export function takeAiPanelLink(): boolean {
  const here = new URL(window.location.href);
  if (here.searchParams.get(PANEL_PARAM) !== AI_PANEL) return false;
  here.searchParams.delete(PANEL_PARAM);
  window.history.replaceState(window.history.state, '', here.href);
  return true;
}
