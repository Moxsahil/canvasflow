// Shared helpers for the scaling lab (infra/scaling/docker-compose.yml).
//
// These scripts run in two places: on this machine (seed, sweep) and inside
// the compose network as the `loadgen` service (coordinator, worker,
// cross-instance), which reuses the sync-server image so the clients run the
// exact yjs / @hocuspocus/provider / ws the service ships with. Modules are
// therefore resolved from LOAD_RESOLVE_FROM when it is set (the image's
// /app/package.json) and from the workspace's sync-server package otherwise.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const RESULTS = resolve(HERE, 'results');

const resolveFrom =
  process.env.LOAD_RESOLVE_FROM ?? resolve(HERE, '../../../services/sync-server/package.json');
const req = createRequire(resolveFrom);

export const load = (name) => req(name);

/** Fake, local-only. Must match AUTH_SECRET in infra/scaling/docker-compose.yml. */
export const AUTH_SECRET =
  process.env.AUTH_SECRET ?? 'local-scaling-auth-secret-not-used-anywhere-else-0000';
/** The origin the sync-server containers allow (their EDITOR_URL). */
export const ORIGIN = 'http://localhost:3002';

/** Hosts these scripts may talk to: this machine, or a service in the compose network. */
const ALLOWED_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  'lb',
  'sync-1',
  'sync-2',
  'sync-solo',
  'sync-prof',
  'postgres',
  'redis',
]);

/** Refuse anything that is not this machine or the lab's own containers. */
export function assertLocal(url) {
  const host = new URL(url.replace(/^wss?:/, 'http:')).hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    console.error(`REFUSING: ${host} is not local`);
    process.exit(2);
  }
}

/**
 * Wall-clock milliseconds with sub-millisecond resolution.
 *
 * Latency here is measured across processes (a writer in one, a receiver in
 * another), so a per-process performance.now() cannot be compared directly.
 * timeOrigin + now() reads the same system clock in every process on the
 * same kernel, which is what all of them share inside the loadgen container.
 */
export const wallNow = () => performance.timeOrigin + performance.now();

/** A board token with the same claims as apps/web/src/lib/auth/editor-token.ts. */
export async function mintToken(seed, name) {
  const { SignJWT } = load('jose');
  return new SignJWT({
    sid: seed.sessionId,
    id: seed.userId,
    email: seed.email,
    name,
    isGuest: false,
    boardId: seed.boardId,
    workspaceId: seed.workspaceId,
    role: 'owner',
    accessSource: 'owner',
    archived: false,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor((Date.now() + 2 * 60 * 60 * 1000) / 1000))
    .setIssuedAt()
    .sign(new TextEncoder().encode(AUTH_SECRET));
}

/** Nearest-rank percentiles, same definition as scripts/metrics/lib.mjs. */
export function stats(samples) {
  const s = Float64Array.from(samples).sort();
  const n = s.length;
  if (!n) return { n: 0 };
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const p95 = s[Math.ceil(0.95 * n) - 1];
  const p99 = s[Math.ceil(0.99 * n) - 1];
  return { n, min: s[0], median, p95, p99, max: s[n - 1] };
}

export function machine() {
  return {
    node: process.version,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memGB: Math.floor(os.totalmem() / 1e9),
    platform: `${os.platform()} ${os.release()}`,
    date: new Date().toISOString(),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function args() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}
