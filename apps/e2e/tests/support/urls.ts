/**
 * Where each app answers. The defaults are the dev servers (`pnpm dev`); the
 * local stack (`pnpm test:e2e:local`) points these at its own ports, so a run
 * never touches the servers you are developing against.
 */
export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
export const GATEWAY = process.env.E2E_GATEWAY_URL ?? 'http://localhost:3001';
export const EDITOR = process.env.E2E_EDITOR_URL ?? 'http://localhost:3002';

/**
 * A pattern for a URL on one of the apps, e.g. `urlOn(EDITOR, /\/boards\//)`
 * for any board in the editor. Matches the host and port, then `path`.
 */
export function urlOn(base: string, path: RegExp = /(?:)/): RegExp {
  const host = new URL(base).host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(host + path.source, path.flags);
}
