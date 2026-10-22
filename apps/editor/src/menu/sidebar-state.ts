/** The cookie the sidebar writes on every toggle. Named to match it exactly. */
const SIDEBAR_COOKIE_NAME = 'sidebar_state';

/**
 * Whether the sidebar was left open, so a reload brings it back as it was.
 *
 * The sidebar persists its own state to a cookie but never reads one — the
 * component is built for a server that can read it and pass `defaultOpen` in.
 * Nothing renders on a server here, so the read happens on the client instead.
 *
 * Defaults to collapsed: this is a canvas app, and the board should have the
 * window until someone asks for the menu.
 */
export function readSidebarState(): boolean {
  if (typeof document === 'undefined') return false;

  return document.cookie.split('; ').some((entry) => entry === `${SIDEBAR_COOKIE_NAME}=true`);
}

/** The cookie the sidebar writes when its edge is dragged to a new width. */
const SIDEBAR_WIDTH_COOKIE_NAME = 'sidebar_width';

/**
 * The width the sidebar was last dragged to, in px, or undefined for the
 * default. The sidebar clamps whatever comes back, so a stale value from an
 * older range can't open it wider than it allows.
 */
export function readSidebarWidth(): number | undefined {
  if (typeof document === 'undefined') return undefined;

  const prefix = `${SIDEBAR_WIDTH_COOKIE_NAME}=`;
  const entry = document.cookie.split('; ').find((it) => it.startsWith(prefix));
  const width = entry ? Number(entry.slice(prefix.length)) : NaN;
  return Number.isFinite(width) ? width : undefined;
}
