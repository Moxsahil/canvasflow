import type { BeforeSendFn, CaptureResult, PostHog } from 'posthog-js';

/**
 * Usage analytics, for accounts that said yes and for nobody else.
 *
 * PostHog is not part of the editor's bundle until someone allows it: it is
 * imported here, on demand, the first time `startAnalytics` runs. Until then
 * nothing is loaded, nothing is sent, and nothing is stored in the browser.
 *
 * Only the named events below are sent, with the few plain details each
 * carries. PostHog's own collectors — clicks, heatmaps, recordings, web
 * vitals, errors, surveys — are all switched off here, whatever the project's
 * settings say, and the remote configuration that could turn them on is never
 * fetched. Addresses are reduced to the kind of page, so a board id or a share
 * link in the URL never leaves the browser. The project discards IP addresses.
 *
 * The id PostHog keeps to tell visits apart goes in local storage, never a
 * cookie, and is deleted when analytics is turned off.
 */

/** Everything that may be recorded, and the details each may carry. */
export interface AnalyticsEvents {
  analytics_enabled: Record<string, never>;
  board_opened: Record<string, never>;
  board_created: Record<string, never>;
  tool_selected: { tool: string };
  input_used: { input: string };
  image_added: { count: number };
  comment_posted: { reply: boolean };
  share_link_created: { role: string };
  copied_as: { format: string };
  image_exported: { format: 'png' | 'svg'; scene: boolean };
  board_saved_to_file: Record<string, never>;
  board_file_opened: { format: string; images: number };
  boards_exported: { boards: number; library: boolean };
  library_item_added: Record<string, never>;
  library_item_placed: Record<string, never>;
}

export type AnalyticsEvent = keyof AnalyticsEvents;

/** The EU region, chosen when the project was made. */
const API_HOST = 'https://eu.i.posthog.com';

/**
 * Set only in production, on the editor's Vercel project. Local development
 * and preview deploys have no key, so they never load PostHog at all.
 */
const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

/**
 * Whether this build can send anything, whatever anyone chooses. The key
 * alone decides, rather than the build mode as well: Vite reads production
 * from NODE_ENV, which a shell can have set to anything.
 */
export function analyticsAvailable(): boolean {
  return typeof KEY === 'string' && KEY.startsWith('phc_');
}

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
/** The account analytics is running for, or null while it is off. */
let activeUser: string | null = null;
const seenInputs = new Set<string>();

/** Properties that would carry a page address, or where the visitor came from. */
const ADDRESS_PROPERTY = /url|referr|pathname|^\$host$|^\$initial_host$|utm_|gclid|fbclid/i;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * The kind of page, never the page: "/boards/:id" rather than the board's
 * address, and no query string, which can hold a share token or the shapes a
 * link points at.
 */
export function pageKind(pathname: string): string {
  return (
    pathname
      .replace(UUID, ':id')
      // Share and invite tokens, and anything else long and opaque.
      .replace(/\/[A-Za-z0-9_-]{20,}(?=\/|$)/g, '/:token')
  );
}

function scrub(properties: Record<string, unknown> | undefined): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(properties ?? {})) {
    if (!ADDRESS_PROPERTY.test(name)) kept[name] = value;
  }
  return kept;
}

/**
 * Every event's last stop before it is sent: page addresses and referrers are
 * removed from it and from the person it describes, and the kind of page put
 * in their place.
 */
export const scrubEvent: BeforeSendFn = (event: CaptureResult) => {
  const page = typeof window === 'undefined' ? undefined : pageKind(window.location.pathname);
  return {
    ...event,
    properties: { ...scrub(event.properties), ...(page !== undefined && { page }) },
    ...(event.$set && { $set: scrub(event.$set) }),
    ...(event.$set_once && { $set_once: scrub(event.$set_once) }),
  };
};

/** Pen, touch or mouse: the first use of each in a session, so the mix can be counted. */
function noteInput(event: PointerEvent): void {
  if (!event.pointerType || seenInputs.has(event.pointerType)) return;
  seenInputs.add(event.pointerType);
  track('input_used', { input: event.pointerType });
}

async function load(): Promise<PostHog | null> {
  const { posthog } = await import('posthog-js');
  posthog.init(KEY!, {
    api_host: API_HOST,
    persistence: 'localStorage',
    opt_out_capturing_persistence_type: 'localStorage',
    person_profiles: 'identified_only',
    // Off, every one of them, whatever the project's settings say.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_product_tours: true,
    disable_conversations: true,
    // Nothing fetched from PostHog but the events going out: no remote
    // configuration that could switch any of the above back on, and no
    // scripts loaded for features we do not use.
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    save_referrer: false,
    save_campaign_params: false,
    before_send: scrubEvent,
  });
  return posthog;
}

/** Resolves once analytics is running for `activeUser`, or has failed to. */
let starting: Promise<void> | null = null;

/**
 * Begin sending, as this account. Called once its answer is a yes, and safe to
 * call again: a later call for the same account waits on the first.
 */
export function startAnalytics(userId: string): Promise<void> {
  if (!analyticsAvailable()) return Promise.resolve();
  if (activeUser === userId && starting) return starting;
  activeUser = userId;
  starting = (async () => {
    loading ??= load().catch(() => null);
    const loaded = await loading;
    if (!loaded || activeUser !== userId) return;
    client = loaded;
    // No event of PostHog's own for this: `analytics_enabled` is sent when the
    // person says yes, not every time a board opens with it already on.
    client.opt_in_capturing({ captureEventName: false });
    client.identify(userId);
    window.addEventListener('pointerdown', noteInput, { capture: true, passive: true });
  })();
  return starting;
}

/**
 * Stop sending, and forget this browser's analytics id. Called when the answer
 * is no, when it changes to no, and on signing out of a board.
 */
export function stopAnalytics(): void {
  activeUser = null;
  starting = null;
  seenInputs.clear();
  if (typeof window === 'undefined') return;
  window.removeEventListener('pointerdown', noteInput, { capture: true });
  if (client) {
    client.opt_out_capturing();
    client.reset();
  }
  forgetStored();
}

/**
 * Remove what PostHog kept in this browser — the id first among it. Done even
 * when PostHog was never loaded in this page: the answer may have changed to
 * no on another device, after this browser had already said yes.
 */
function forgetStored(): void {
  if (!KEY) return;
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
      for (const key of keys) if (key?.includes(KEY)) storage.removeItem(key);
    } catch {
      // Storage blocked: then nothing was kept there either.
    }
  }
}

/** Record one event. Does nothing unless analytics is running. */
export function track<E extends AnalyticsEvent>(
  event: E,
  ...[properties]: AnalyticsEvents[E] extends Record<string, never> ? [] : [AnalyticsEvents[E]]
): void {
  if (!client || activeUser === null) return;
  client.capture(event, properties ?? {});
}
