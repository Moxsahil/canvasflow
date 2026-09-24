import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import {
  accounts,
  auditLog,
  authSessions,
  createClient,
  ensureBoardForUser,
  memberships,
  passwordResetRequests,
  passwordResetTokens,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { parseEnv } from '../src/config/env.js';
import type { DatabaseService } from '../src/infra/database/database.service.js';
import { ResetTokenService } from '../src/modules/password-reset/reset-token.service.js';

/**
 * End-to-end check of forgot-password and reset-password, against a running
 * gateway and a real database.
 *
 *   pnpm --filter @canvasflow/api-gateway verify:password-reset
 *
 * The unit tests beside reset-eligibility.ts cover the decisions. This covers
 * what they cannot reach: statuses and bodies, what the database holds
 * afterwards, the race between two tabs, and what a reset does to every
 * session and board token that existed before it.
 *
 * Links are minted with the real ResetTokenService rather than a copy of it —
 * the raw token otherwise only exists inside the email — so minting is tested
 * too, including that a new link cancels the one before it.
 *
 * Creates throwaway accounts on Resend's test inbox (delivered+…@resend.dev),
 * so the mail the gateway sends goes nowhere real and bounces nothing. Removes
 * every row it wrote. Refuses to run against a production configuration.
 *
 * Makes exactly eleven forgot requests, the last to prove the per-IP limit
 * (ten per ten minutes) trips — so run it at most once every ten minutes, and
 * not straight after trying the forgot page by hand.
 */

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3001';
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
const run = randomUUID().slice(0, 8);

const OLD_PASSWORD = 'Verify!Reset1';
const NEW_PASSWORD = 'Verify!Reset2';

// In the order the forgot requests are sent. The two whose timing is compared
// go first and back to back, so no earlier request's after-the-reply work (a
// mail being sent) is still running while either is measured.
const addresses = {
  unknown: `delivered+reset-${run}-none@resend.dev`,
  password: `delivered+reset-${run}-pw@resend.dev`,
  provider: `delivered+reset-${run}-oauth@resend.dev`,
  disabled: `delivered+reset-${run}-off@resend.dev`,
  guest: `guest-reset-${run}@guests.invalid`,
};
const fillers = ['a', 'b', 'c'].map((s) => `delivered+reset-${run}-${s}@resend.dev`);

const env = parseEnv();
const db = createClient(env.DATABASE_URL);
const tokens = new ResetTokenService({ db } as DatabaseService);

let failures = 0;

function check(name: string, passed: boolean, detail = ''): void {
  if (passed) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${GATEWAY}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

async function timed(path: string, body: unknown) {
  const started = performance.now();
  const response = await post(path, body);
  const text = await response.text();
  return { status: response.status, text, ms: performance.now() - started };
}

function cookie(response: Response, name: string): string | null {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const [key, ...rest] = (pair ?? '').split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

async function userId(email: string): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!row) throw new Error(`No test account for ${email}`);
  return row.id;
}

/** Poll for something the gateway does after it has already replied. */
async function eventually<T>(read: () => Promise<T | undefined>, ms = 15_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const value = await read();
    if (value !== undefined) return value;
    await sleep(250);
  }
  return undefined;
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run against a production configuration.');
  }

  const health = await fetch(`${GATEWAY}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`No gateway answering at ${GATEWAY}. Start it first.`);

  console.log(`\nVerifying password recovery on ${GATEWAY}\n`);
  await seed();

  try {
    if (!(await forgot())) return;
    await checkRoute();
    await reset();
    await limits();
  } finally {
    await cleanup();
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  if (failures > 0) process.exitCode = 1;
}

async function seed(): Promise<void> {
  const hash = await bcrypt.hash(OLD_PASSWORD, 12);
  await db.insert(users).values([
    // Unconfirmed on purpose: a reset should confirm it.
    { email: addresses.password, name: 'Reset Verify', passwordHash: hash },
    { email: addresses.provider, name: 'Reset Provider', passwordHash: null },
    {
      email: addresses.disabled,
      name: 'Reset Disabled',
      passwordHash: hash,
      disabledAt: new Date(),
    },
    { email: addresses.guest, name: 'Reset Guest', isGuest: true },
  ]);
  await db.insert(accounts).values({
    userId: await userId(addresses.provider),
    type: 'oidc',
    provider: 'google',
    providerAccountId: `verify-reset-${run}`,
  });
}

/**
 * Every kind of address gets the same answer, and only the right ones get a
 * link. Returns false if the per-IP budget was already spent, since nothing
 * after that would mean anything.
 */
async function forgot(): Promise<boolean> {
  console.log('forgot');

  // Warm several of the gateway's database connections first, with requests
  // that touch the database and nothing else. Each forgot request starts work
  // after its reply, and if the next request finds every open connection busy
  // with that work, the pool opens a new one — a TLS handshake that can cost
  // far more than anything being measured here.
  await Promise.all(
    Array.from({ length: 4 }, () =>
      post('/auth/password/reset/check', { token: randomBytes(32).toString('base64url') }),
    ),
  );

  const results: Record<string, Awaited<ReturnType<typeof timed>>> = {};
  for (const [kind, email] of Object.entries(addresses)) {
    // Let the previous request's after-the-reply work finish, so each request
    // is measured on its own rather than behind its neighbour.
    await sleep(1500);
    results[kind] = await timed('/auth/password/forgot', { email });
    if (kind === 'unknown' && results[kind]?.status === 429) {
      console.log(
        '  STOP  the forgot route is already rate limited for this address.\n' +
          '        Wait ten minutes (or restart the gateway) and run this again.',
      );
      failures += 1;
      return false;
    }
  }

  const statuses = Object.values(results).map((r) => r.status);
  const bodies = new Set(Object.values(results).map((r) => r.text));
  check(
    'every kind of address answers 202',
    statuses.every((s) => s === 202),
    statuses.join(','),
  );
  check(
    'every kind of address gets the identical body',
    bodies.size === 1,
    [...bodies].join(' | '),
  );

  const times = Object.fromEntries(
    Object.entries(results).map(([kind, r]) => [kind, Math.round(r.ms)]),
  );
  console.log(`        response times (ms): ${JSON.stringify(times)}`);
  const gap = Math.abs((results.password?.ms ?? 0) - (results.unknown?.ms ?? 0));
  check(
    'a real account answers no slower than an unknown address',
    gap < 250,
    `${Math.round(gap)}ms apart — account work must happen after the reply`,
  );

  const passwordId = await userId(addresses.password);
  const issued = await eventually(async () => {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, passwordId));
    return row;
  });
  check('a password account is issued a link, after the reply', issued !== undefined);

  const audited = await eventually(async () => {
    const [row] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.actorId, passwordId), eq(auditLog.action, 'auth.password.reset_requested')),
      );
    return row;
  });
  check('the request is audited', audited !== undefined);
  check(
    'the audit row carries no address or token',
    audited !== undefined && !JSON.stringify(audited.metadata).includes('@'),
    JSON.stringify(audited?.metadata),
  );

  // Long enough for any background work for these three to have happened.
  await sleep(2000);
  for (const kind of ['provider', 'disabled', 'guest'] as const) {
    const rows = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, await userId(addresses[kind])));
    check(`a ${kind} account gets no link`, rows.length === 0, `${rows.length} row(s)`);
  }

  const counted = await db
    .select({ id: passwordResetRequests.id })
    .from(passwordResetRequests)
    .where(eq(passwordResetRequests.emailHash, digest(addresses.unknown)));
  check('an unknown address is counted, as a digest only', counted.length === 1);

  return true;
}

/** Opening a link is harmless, and says the right thing. */
async function checkRoute(): Promise<void> {
  console.log('\ncheck');

  const malformed = await post('/auth/password/reset/check', { token: 'short' });
  check('a malformed token is refused as 400', malformed.status === 400, `got ${malformed.status}`);

  const unknown = (await (
    await post('/auth/password/reset/check', { token: randomBytes(32).toString('base64url') })
  ).json()) as { data?: { reason?: string } };
  check('an unknown token reads as invalid', unknown.data?.reason === 'invalid');

  const id = await userId(addresses.password);
  const first = await tokens.issue(id);
  const second = await tokens.issue(id);

  const replaced = (await (
    await post('/auth/password/reset/check', { token: first.token })
  ).json()) as { data?: { reason?: string } };
  check('a newer link cancels the older one', replaced.data?.reason === 'invalid');

  const valid = (await (
    await post('/auth/password/reset/check', { token: second.token })
  ).json()) as { data?: { valid?: boolean; email?: string } };
  check('a fresh link reads as valid', valid.data?.valid === true);
  check('and names the account for password managers', valid.data?.email === addresses.password);

  const [row] = await db
    .select({ usedAt: passwordResetTokens.usedAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, digest(second.token)));
  check('checking a link does not spend it', row?.usedAt === null);

  const expiredRaw = randomBytes(32).toString('base64url');
  await db.insert(passwordResetTokens).values({
    userId: id,
    tokenHash: digest(expiredRaw),
    expiresAt: new Date(Date.now() - 1000),
  });
  const expired = (await (
    await post('/auth/password/reset/check', { token: expiredRaw })
  ).json()) as { data?: { reason?: string } };
  check('an expired link reads as expired', expired.data?.reason === 'expired');

  const disabledRaw = randomBytes(32).toString('base64url');
  await db.insert(passwordResetTokens).values({
    userId: await userId(addresses.disabled),
    tokenHash: digest(disabledRaw),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const disabled = (await (
    await post('/auth/password/reset/check', { token: disabledRaw })
  ).json()) as { data?: { reason?: string } };
  check('a link for a barred account reads as invalid', disabled.data?.reason === 'invalid');
}

/** Spending a link: the rules, the race, and what it does to every session. */
async function reset(): Promise<void> {
  console.log('\nreset');

  const id = await userId(addresses.password);
  const { token } = await tokens.issue(id);

  const weak = await post('/auth/password/reset', { token, password: 'weakpass' });
  const weakBody = (await weak.json()) as { message?: string };
  check('a password breaking a rule is refused as 400', weak.status === 400, weakBody.message);

  const same = await post('/auth/password/reset', { token, password: OLD_PASSWORD });
  check('the current password is refused as 400', same.status === 400, `got ${same.status}`);

  const [unspent] = await db
    .select({ usedAt: passwordResetTokens.usedAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, digest(token)));
  check('a refused password does not spend the link', unspent?.usedAt === null);

  // Two signed-in devices, a board open on one of them, and some failed
  // sign-ins — everything a reset is supposed to sweep away.
  const signIn = (password: string) =>
    post('/auth/signin', { email: addresses.password, password });
  const deviceA = await signIn(OLD_PASSWORD);
  const deviceB = await signIn(OLD_PASSWORD);
  await signIn('Wrong!Guess1');
  await signIn('Wrong!Guess2');
  const accessA = cookie(deviceA, 'cf.access') ?? '';
  const refreshA = cookie(deviceA, 'cf.refresh') ?? '';
  const refreshB = cookie(deviceB, 'cf.refresh') ?? '';

  const board = await ensureBoardForUser(db, { userId: id, userName: 'Reset Verify' });
  const minted = await fetch(`${GATEWAY}/auth/editor-token?boardId=${board.id}`, {
    headers: { cookie: `cf.access=${accessA}; cf.refresh=${refreshA}` },
  });
  const boardToken = ((await minted.json()) as { token?: string }).token ?? '';
  check('before: device A can mint a board token', minted.status === 200 && boardToken !== '');

  const [left, right] = await Promise.all([
    post('/auth/password/reset', { token, password: NEW_PASSWORD }),
    post('/auth/password/reset', { token, password: NEW_PASSWORD }),
  ]);
  const outcomes = (await Promise.all([left.json(), right.json()])).map(
    (b) => (b as { data?: { ok?: boolean } }).data?.ok,
  );
  check(
    'two tabs spending one link: exactly one succeeds',
    outcomes.filter((ok) => ok === true).length === 1 && outcomes.includes(false),
    JSON.stringify(outcomes),
  );
  const winner = outcomes[0] === true ? left : right;
  check('the reset clears the session cookies', cookie(winner, 'cf.access') === '');

  check('the old password no longer signs in', (await signIn(OLD_PASSWORD)).status === 401);
  check('the new password signs in', (await signIn(NEW_PASSWORD)).status === 200);

  const [account] = await db.select().from(users).where(eq(users.id, id));
  check('the address is now confirmed', account?.emailVerifiedAt !== null);
  check('the change time is recorded', account?.passwordChangedAt !== null);

  const changedAt = account?.passwordChangedAt?.getTime() ?? Date.now();
  const sessions = await db
    .select({ revokedAt: authSessions.revokedAt, createdAt: authSessions.createdAt })
    .from(authSessions)
    .where(eq(authSessions.userId, id));
  const before = sessions.filter((s) => s.createdAt.getTime() < changedAt);
  check(
    'every session from before the reset is revoked',
    before.length >= 2 && before.every((s) => s.revokedAt !== null),
    `${before.filter((s) => s.revokedAt === null).length} still live`,
  );

  const renewed = await fetch(`${GATEWAY}/auth/refresh`, {
    method: 'POST',
    headers: { cookie: `cf.refresh=${refreshB}` },
  });
  check('an old device cannot renew its session', renewed.status === 401, `got ${renewed.status}`);

  const me = await fetch(`${GATEWAY}/users/me`, { headers: { cookie: `cf.access=${accessA}` } });
  check(
    "an old device's access token stops working at once",
    me.status === 401,
    `got ${me.status}`,
  );

  const withBoardToken = await fetch(`${GATEWAY}/users/me`, {
    headers: { Authorization: `Bearer ${boardToken}` },
  });
  check(
    "an old device's board token stops working at once",
    withBoardToken.status === 401,
    `got ${withBoardToken.status}`,
  );

  const failuresLeft = await db
    .select({ id: signInFailures.id })
    .from(signInFailures)
    .where(eq(signInFailures.emailHash, digest(addresses.password)));
  check('earlier failed sign-ins were forgiven', failuresLeft.length === 0);

  const audit = await db
    .select({ action: auditLog.action, metadata: auditLog.metadata })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.actorId, id),
        inArray(auditLog.action, ['auth.password.reset', 'auth.session.revoked']),
      ),
    );
  check('the reset and the revocation are audited', audit.length === 2, `${audit.length} row(s)`);
  check(
    'no audit row carries the token or its digest',
    !JSON.stringify(audit).includes(token) && !JSON.stringify(audit).includes(digest(token)),
  );

  const stale = randomBytes(32).toString('base64url');
  await db.insert(passwordResetTokens).values({
    userId: id,
    tokenHash: digest(stale),
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(changedAt - 1000),
  });
  const staleCheck = (await (
    await post('/auth/password/reset/check', { token: stale })
  ).json()) as { data?: { reason?: string } };
  check('a link issued before the latest change is refused', staleCheck.data?.reason === 'invalid');
}

/** The per-address and per-IP limits, and the Origin check. */
async function limits(): Promise<void> {
  console.log('\nlimits');

  const again = await post('/auth/password/forgot', { email: addresses.unknown });
  const againReal = await post('/auth/password/forgot', { email: addresses.password });
  const bodyUnknown = (await again.json()) as { message?: string; retryAfterSeconds?: number };
  const bodyReal = (await againReal.json()) as { message?: string };
  check('a second request inside a minute is refused', again.status === 429, `got ${again.status}`);
  check(
    'the refusal is the same for a real account',
    againReal.status === 429 && bodyReal.message === bodyUnknown.message,
  );
  check('the refusal says how long to wait', typeof bodyUnknown.retryAfterSeconds === 'number');

  const foreign = await post(
    '/auth/password/forgot',
    { email: addresses.unknown },
    { Origin: 'https://evil.example' },
  );
  check(
    'another site cannot trigger a reset mail',
    foreign.status === 403,
    `got ${foreign.status}`,
  );

  // Eight forgot requests so far from this address; the budget is ten.
  await post('/auth/password/forgot', { email: fillers[0] });
  await post('/auth/password/forgot', { email: fillers[1] });
  const blocked = await post('/auth/password/forgot', { email: fillers[2] });
  check(
    'the per-IP limit trips on the eleventh request',
    blocked.status === 429,
    `got ${blocked.status}`,
  );
}

async function cleanup(): Promise<void> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, Object.values(addresses)));
  const ids = rows.map((row) => row.id);

  if (ids.length > 0) {
    // Boards name their owner without a cascade, so the workspaces go first;
    // their boards and memberships go with them.
    const owned = await db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(inArray(memberships.userId, ids));
    if (owned.length > 0) {
      await db.delete(workspaces).where(
        inArray(
          workspaces.id,
          owned.map((m) => m.workspaceId),
        ),
      );
    }
    await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
    // Sessions, their tokens, reset links and provider links cascade.
    await db.delete(users).where(inArray(users.id, ids));
  }

  const typed = [...Object.values(addresses), ...fillers].map(digest);
  await db.delete(passwordResetRequests).where(inArray(passwordResetRequests.emailHash, typed));
  await db.delete(signInFailures).where(inArray(signInFailures.emailHash, typed));
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error('\nverify:password-reset failed to run:', error);
    process.exit(1);
  });
