import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import {
  auditLog,
  authSessions,
  authSessionTokens,
  createClient,
  signInFailures,
  users,
} from '@canvasflow/db';
import { parseEnv } from '../src/config/env.js';

/**
 * End-to-end check of the sign-in and session rules, against a running gateway.
 *
 *   pnpm --filter @canvasflow/api-gateway verify:auth
 *
 * The unit tests next to `rotation-decision.ts` cover the judgement. This
 * covers everything the judgement cannot reach on its own: cookies, statuses,
 * what the database actually holds afterwards, and the two failures that
 * reached production — a session that could not be renewed, and a lost
 * rotation response that killed one permanently.
 *
 * Runs against a real gateway and a real database because that is where those
 * two lived. A mocked version of either would have passed throughout.
 *
 * Creates one throwaway account and removes it, along with every row it wrote.
 * Safe against a development database; it refuses to touch production.
 *
 * Takes about ninety seconds: the reuse rules need the grace window to pass,
 * and the rate-limit section waits out the per-IP budget first.
 */

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3001';
const EMAIL = `verify-auth-${randomUUID()}@example.invalid`;
const UNKNOWN = `verify-auth-${randomUUID()}@example.invalid`;
const PASSWORD = 'Verify!Auth1';

const env = parseEnv();
const db = createClient(env.DATABASE_URL);

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

/** One cookie's value out of a response, or null. */
function cookie(response: Response, name: string): string | null {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const [key, ...rest] = (pair ?? '').split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function signIn(password = PASSWORD, email = EMAIL): Promise<Response> {
  return fetch(`${GATEWAY}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

function renew(refreshToken: string): Promise<Response> {
  return fetch(`${GATEWAY}/auth/refresh`, {
    method: 'POST',
    headers: { cookie: `cf.refresh=${refreshToken}` },
  });
}

async function sessionRow(sessionId: string) {
  const [row] = await db.select().from(authSessions).where(eq(authSessions.id, sessionId)).limit(1);
  return row;
}

function sessionIdOf(accessToken: string): string {
  const payload = accessToken.split('.')[1] ?? '';
  return (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sid: string }).sid;
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to run against a production configuration.');
  }

  const health = await fetch(`${GATEWAY}/health`).catch(() => null);
  if (!health?.ok) throw new Error(`No gateway answering at ${GATEWAY}. Start it first.`);

  console.log(`\nVerifying ${GATEWAY}\n`);
  await db
    .insert(users)
    .values({ email: EMAIL, name: 'Verify Auth', passwordHash: await bcrypt.hash(PASSWORD, 12) });

  try {
    await credentials();
    await sessionLifecycle();
    await rateLimiting();
  } finally {
    await cleanup();
  }

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
  if (failures > 0) process.exitCode = 1;
}

/** Steps 1 to 4 of the guide: the contract, and what a refusal may say. */
async function credentials(): Promise<void> {
  console.log('credentials');

  const good = await signIn();
  check('a correct password authenticates', good.status === 200, `got ${good.status}`);
  check(
    'it sets both session cookies',
    Boolean(cookie(good, 'cf.access') && cookie(good, 'cf.refresh')),
  );

  const wrong = (await (await signIn('WrongPass1!')).json()) as { message?: string };
  const unknown = (await (await signIn('WrongPass1!', UNKNOWN)).json()) as { message?: string };
  check(
    'a wrong password and an unknown address answer identically',
    wrong.message === unknown.message && wrong.message === 'Invalid email or password',
    `${wrong.message} / ${unknown.message}`,
  );

  const oversized = await fetch(`${GATEWAY}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'a'.repeat(3_000_000),
  });
  check('an oversized body is refused as 413', oversized.status === 413, `got ${oversized.status}`);

  const redacted = (await (await fetch(`${GATEWAY}/users/me?code=SECRET&boardId=kept`)).json()) as {
    path?: string;
  };
  check(
    'an error body redacts a credential in the query',
    redacted.path?.includes('code=') === true &&
      !redacted.path.includes('SECRET') &&
      redacted.path.includes('boardId=kept'),
    redacted.path,
  );
}

/** Steps 6 to 10: rotation, the rescue, revocation, sign-out. */
async function sessionLifecycle(): Promise<void> {
  console.log('\nsessions');

  const first = await signIn();
  const access = cookie(first, 'cf.access') ?? '';
  const original = cookie(first, 'cf.refresh') ?? '';
  const id = sessionIdOf(access);

  const renewed = await renew(original);
  const replacement = cookie(renewed, 'cf.refresh') ?? '';
  check('a refresh cookie alone renews the session', renewed.status === 200);
  check('rotation issues a different token', replacement !== '' && replacement !== original);

  const before = await sessionRow(id);
  await sleep(REUSE_GRACE_WAIT);

  const rescued = await renew(original);
  const afterRescue = await sessionRow(id);
  check('a spent token whose replacement never arrived is rescued', rescued.status === 200);
  check('the rescue leaves the session live', afterRescue?.revokedAt === null);
  check('the rescue is recorded so it cannot happen twice', afterRescue?.recoveredAt !== null);
  check(
    'the rescue slid the expiry forward',
    (afterRescue?.expiresAt.getTime() ?? 0) > (before?.expiresAt.getTime() ?? 0),
  );

  await sleep(REUSE_GRACE_WAIT);
  const second = await renew(replacement);
  check('a second rescue is refused', second.status === 401, `got ${second.status}`);
  check('and the session is revoked', (await sessionRow(id))?.revokedAt !== null);

  const out = await signIn();
  const outId = sessionIdOf(cookie(out, 'cf.access') ?? '');
  const signedOut = await fetch(`${GATEWAY}/auth/signout`, {
    method: 'POST',
    headers: { cookie: `cf.refresh=${cookie(out, 'cf.refresh')}` },
  });
  check('sign-out answers 204', signedOut.status === 204);
  check('sign-out clears the cookies', cookie(signedOut, 'cf.access') === '');
  check('sign-out revokes the row', (await sessionRow(outId))?.revokedAt !== null);
  check(
    'a revoked session cannot be renewed',
    (await renew(cookie(out, 'cf.refresh') ?? '')).status === 401,
  );

  const rows = await db
    .select({ action: auditLog.action })
    .from(auditLog)
    .where(eq(auditLog.targetId, outId));
  check('sign-in and sign-out are both audited', rows.length === 2, `${rows.length} row(s)`);
}

/** Step 12: the limit that counts the account rather than the caller. */
async function rateLimiting(): Promise<void> {
  console.log('\nrate limiting  (waiting out the per-IP budget first)');
  await sleep(61_000);

  for (let i = 0; i < 10; i += 1) await signIn('WrongPass1!');
  const blocked = await signIn('WrongPass1!');
  const body = (await blocked.json()) as { retryAfterSeconds?: number };
  check('an eleventh wrong answer is refused', blocked.status === 429, `got ${blocked.status}`);
  check('the refusal says how long to wait', typeof body.retryAfterSeconds === 'number');
  check(
    'even a correct password is refused while throttled',
    (await signIn()).status === 429,
    'otherwise guessing still works',
  );
  check(
    'the stored address is a digest, not the address',
    (
      await db
        .select({ id: signInFailures.id })
        .from(signInFailures)
        .where(eq(signInFailures.emailHash, createHash('sha256').update(EMAIL).digest('hex')))
    ).length >= 10,
  );
}

/** Long enough to leave the grace window with room to spare. */
const REUSE_GRACE_WAIT = 11_000;

async function cleanup(): Promise<void> {
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  if (!account) return;

  const sessions = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(eq(authSessions.userId, account.id));

  for (const session of sessions) {
    await db.delete(authSessionTokens).where(eq(authSessionTokens.sessionId, session.id));
  }
  await db.delete(auditLog).where(eq(auditLog.actorId, account.id));
  await db.delete(authSessions).where(eq(authSessions.userId, account.id));
  for (const address of [EMAIL, UNKNOWN]) {
    await db
      .delete(signInFailures)
      .where(and(eq(signInFailures.emailHash, createHash('sha256').update(address).digest('hex'))));
  }
  await db.delete(users).where(eq(users.id, account.id));
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error('\nverify:auth failed to run:', error);
    process.exit(1);
  });
