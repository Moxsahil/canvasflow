import { createHash, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { and, eq, inArray, or } from 'drizzle-orm';
import {
  accountDeletions,
  auditLog,
  authSessions,
  boards,
  createClient,
  memberships,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';

/**
 * Asking to delete an account, through the real gateway: the preview, both
 * ways of proving it is really you, and what a request leaves behind.
 *
 * Two throwaway accounts made through the real signup route, on Resend's test
 * inbox so nothing real is emailed. Pat has a password and is asked for it.
 * Gee is made the same way and then has the password taken off in the
 * database — the state of an account that signs in only with Google or GitHub
 * — so the recent sign-in check can be driven without a provider.
 *
 * Needs the local gateway running, and the development database in
 * DATABASE_URL, read from the repository's .env when it is not already set.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=deletion
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const suffix = randomUUID().slice(0, 8);
const PAT = `delivered+e2e-deletion-pat-${suffix}@resend.dev`;
const GEE = `delivered+e2e-deletion-gee-${suffix}@resend.dev`;
const PASSWORD = 'E2e!Deletion-one1';
const DAY_MS = 24 * 60 * 60 * 1000;

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial' });
test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

const made = { pat: '', gee: '', patBoard: '' };
/** Each account's cookies, as the browser that signed in would send them. */
const cookie = { pat: '', gee: '' };

async function signUp(email: string, name: string): Promise<string> {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ email, password: PASSWORD, name }),
  });
  expect(response.status, 'signup through the gateway').toBe(201);
  const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email));
  return row!.id;
}

/** Sign in through the gateway and keep the cookies it sets, or the status it refused with. */
async function signIn(email: string): Promise<{ status: number; cookie: string }> {
  const response = await fetch(`${GATEWAY}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const cookies = response.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ');
  return { status: response.status, cookie: cookies };
}

function preview(as: string) {
  return fetch(`${GATEWAY}/users/me/deletion`, { headers: { Cookie: as } });
}

function ask(as: string, body: unknown, origin = WEB) {
  return fetch(`${GATEWAY}/users/me/deletion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: as, Origin: origin },
    body: JSON.stringify(body),
  });
}

test.beforeAll(async () => {
  made.pat = await signUp(PAT, 'E2E Pat');
  made.gee = await signUp(GEE, 'E2E Gee');

  // One board of Pat's own, to see it hidden.
  const [workspace] = await db!
    .insert(workspaces)
    .values({ name: 'E2E Pat', slug: `e2e-deletion-request-${suffix}` })
    .returning({ id: workspaces.id });
  await db!
    .insert(memberships)
    .values({ workspaceId: workspace!.id, userId: made.pat, role: 'owner' });
  const [board] = await db!
    .insert(boards)
    .values({ workspaceId: workspace!.id, ownerId: made.pat, title: 'Pat board' })
    .returning({ id: boards.id });
  made.patBoard = board!.id;
});

test.afterAll(async () => {
  if (!db) return;
  const people = [made.pat, made.gee].filter(Boolean);
  if (people.length > 0) {
    const owned = await db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(inArray(memberships.userId, people));
    await db.delete(boards).where(inArray(boards.ownerId, people));
    if (owned.length > 0) {
      await db.delete(workspaces).where(
        inArray(
          workspaces.id,
          owned.map((row) => row.workspaceId),
        ),
      );
    }
    await db.delete(accountDeletions).where(inArray(accountDeletions.userId, people));
    await db
      .delete(auditLog)
      .where(or(inArray(auditLog.actorId, people), inArray(auditLog.targetId, people)));
    await db.delete(users).where(inArray(users.id, people));
  }
  const digests = [PAT, GEE].map((email) => createHash('sha256').update(email).digest('hex'));
  await db.delete(signInFailures).where(inArray(signInFailures.emailHash, digests));
});

test('the preview says what would go, and asks a password account for its password', async () => {
  const signedIn = await signIn(PAT);
  expect(signedIn.status).toBe(200);
  cookie.pat = signedIn.cookie;

  const response = await preview(cookie.pat);
  expect(response.status).toBe(200);
  const { data } = (await response.json()) as { data: Record<string, unknown> };
  expect(data).toMatchObject({
    email: PAT,
    identityCheck: 'password',
    recentSignInUntil: null,
    graceDays: 7,
    ownedBoards: 1,
    sharedBoards: [],
    sharedWorkspaces: [],
  });
});

test('a request from another site is refused', async () => {
  const response = await ask(
    cookie.pat,
    { confirmEmail: PAT, currentPassword: PASSWORD },
    'https://attacker.example',
  );
  expect(response.status).toBe(403);
});

test('the typed address has to be the account’s own', async () => {
  const response = await ask(cookie.pat, {
    confirmEmail: 'someone-else@example.com',
    currentPassword: PASSWORD,
  });
  expect(response.status).toBe(400);
  expect(((await response.json()) as { message: string }).message).toMatch(/email address/);
});

test('a wrong password is refused, and counts as a wrong sign-in', async () => {
  const response = await ask(cookie.pat, { confirmEmail: PAT, currentPassword: 'not-it' });
  expect(response.status).toBe(400);
  expect(((await response.json()) as { message: string }).message).toMatch(/password is not right/);

  const digest = createHash('sha256').update(PAT).digest('hex');
  const failures = await db!
    .select()
    .from(signInFailures)
    .where(eq(signInFailures.emailHash, digest));
  expect(failures.length).toBeGreaterThan(0);
});

test('the right answers schedule the deletion and sign everything out', async () => {
  const before = Date.now();
  const response = await ask(cookie.pat, {
    confirmEmail: ` ${PAT.toUpperCase()} `,
    currentPassword: PASSWORD,
  });
  expect(response.status).toBe(200);

  const { data } = (await response.json()) as { data: { purgeAfter: string } };
  const purgeAfter = Date.parse(data.purgeAfter);
  expect(purgeAfter).toBeGreaterThanOrEqual(before + 7 * DAY_MS - 60_000);
  expect(purgeAfter).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);

  // This browser's cookies are cleared on the way out…
  expect(
    response.headers.getSetCookie().some((line) => /^cf\.access=;/.test(line)),
    'the access cookie is cleared',
  ).toBe(true);
  // …and the credential they held has stopped working anyway.
  expect((await preview(cookie.pat)).status).toBe(401);
  // Nor can the account sign back in.
  expect((await signIn(PAT)).status).toBe(401);

  const [request] = await db!
    .select()
    .from(accountDeletions)
    .where(eq(accountDeletions.userId, made.pat));
  expect(request?.status).toBe('scheduled');
  expect(request?.purgeAfter.toISOString()).toBe(new Date(purgeAfter).toISOString());

  const [account] = await db!
    .select({ disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, made.pat));
  expect(account?.disabledAt).toEqual(request?.requestedAt);

  const [board] = await db!
    .select({ deletedAt: boards.deletedAt })
    .from(boards)
    .where(eq(boards.id, made.patBoard));
  expect(board?.deletedAt).toEqual(request?.requestedAt);

  const live = await db!
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(
      and(eq(authSessions.userId, made.pat), eq(authSessions.revokedAt, request!.requestedAt)),
    );
  expect(live.length).toBeGreaterThan(0);

  const [logged] = await db!
    .select({ metadata: auditLog.metadata })
    .from(auditLog)
    .where(
      and(eq(auditLog.actorId, made.pat), eq(auditLog.action, 'auth.account.deletion_requested')),
    );
  expect(logged?.metadata).toMatchObject({
    requestId: request?.id,
    hiddenBoards: 1,
    identityCheck: 'password',
  });
});

test('an account with no password has to have signed in recently', async () => {
  const signedIn = await signIn(GEE);
  expect(signedIn.status).toBe(200);
  cookie.gee = signedIn.cookie;
  // Now an account that signs in only through a provider.
  await db!.update(users).set({ passwordHash: null }).where(eq(users.id, made.gee));

  const fresh = (await (await preview(cookie.gee)).json()) as {
    data: { identityCheck: string; recentSignInUntil: string | null };
  };
  expect(fresh.data.identityCheck).toBe('recent-sign-in');
  expect(Date.parse(fresh.data.recentSignInUntil ?? '')).toBeGreaterThan(Date.now());

  // The same sign-in, eleven minutes on.
  await db!
    .update(authSessions)
    .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(authSessions.userId, made.gee));

  const stale = (await (await preview(cookie.gee)).json()) as {
    data: { recentSignInUntil: string | null };
  };
  expect(stale.data.recentSignInUntil).toBeNull();

  const response = await ask(cookie.gee, { confirmEmail: GEE });
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'recent-sign-in-required' });
});

test('straight after signing in, it can ask without a password', async () => {
  await db!
    .update(authSessions)
    .set({ createdAt: new Date() })
    .where(eq(authSessions.userId, made.gee));

  const response = await ask(cookie.gee, { confirmEmail: GEE });
  expect(response.status).toBe(200);

  const [request] = await db!
    .select({ status: accountDeletions.status })
    .from(accountDeletions)
    .where(eq(accountDeletions.userId, made.gee));
  expect(request?.status).toBe('scheduled');
});
