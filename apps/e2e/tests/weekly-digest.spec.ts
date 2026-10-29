import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import {
  auditLog,
  boardActivity,
  boardMembers,
  boards,
  createClient,
  memberships,
  notificationDeliveries,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * The weekly digest, end to end:
 *
 * - The sync-server counts who changed which board.
 * - A dry run counts who would get a digest and sends nothing.
 * - A real run emails somebody whose board another person changed, and
 *   nobody with nothing to read; running it again the same week sends
 *   nothing more.
 * - The route takes only the scheduled job's secret.
 *
 * Needs the local web app, editor, gateway and sync-server running, the
 * gateway's RESEND_API_KEY and its DIGEST_TRIGGER_SECRET. A real run is for
 * everyone in the development database who turned the digest on, not only
 * these throwaway people, who are removed afterwards.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=digest
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

/** The digest job's secret, from the gateway's own settings. Read, never set into this process. */
function triggerSecret(): string | null {
  try {
    const file = readFileSync(
      new URL('../../../services/api-gateway/.env', import.meta.url),
      'utf8',
    );
    return /^DIGEST_TRIGGER_SECRET=(.+)$/m.exec(file)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EDITOR = 'http://localhost:3002';
const RUN = randomUUID().slice(0, 8);
const PREFIX = 'delivered+e2e-digest-';
const PASSWORD = 'E2e!Digest-one1';
const OWNER = { email: `${PREFIX}owner-${RUN}@resend.dev`, name: 'Olu Owner' };
const PARTNER = { email: `${PREFIX}partner-${RUN}@resend.dev`, name: 'Pat Partner' };
const LONER = { email: `${PREFIX}loner-${RUN}@resend.dev`, name: 'Lee Loner' };

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;
const secret = triggerSecret();

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(!secret, "the gateway's DIGEST_TRIGGER_SECRET is not set");
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

let boardId = '';
const ids: Record<string, string> = {};

async function signIn(browser: Browser, email: string, at?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 45_000 });
  if (at) await page.goto(at);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  return page;
}

function startDigest(body: unknown, authorization = `Bearer ${secret}`) {
  return fetch(`${GATEWAY}/internal/digest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization },
    body: JSON.stringify(body),
  });
}

/** Wait for a run under way to finish: a dry run is refused while one is. */
async function dryRunWhenIdle(): Promise<{ withNews: number; emailed: number }> {
  for (let i = 0; i < 60; i++) {
    const res = await startDigest({ dryRun: true });
    if (res.status === 200)
      return ((await res.json()) as { data: { withNews: number; emailed: number } }).data;
    expect(res.status).toBe(409);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('the digest run never finished');
}

/** Each person's digests this week, as emailed (true) or not. */
async function digests(email: string): Promise<boolean[]> {
  const rows = await db!
    .select({ emailedAt: notificationDeliveries.emailedAt })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, ids[email]!),
        eq(notificationDeliveries.kind, 'weekly-digest'),
      ),
    );
  return rows.map((row) => row.emailedAt !== null);
}

async function cleanUp() {
  if (!db) return;
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${PREFIX}%`));
  const peopleIds = people.map((p) => p.id);
  if (peopleIds.length === 0) return;
  const theirs = await db
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(inArray(memberships.userId, peopleIds));
  if (theirs.length > 0) {
    await db.delete(workspaces).where(
      inArray(
        workspaces.id,
        theirs.map((m) => m.workspaceId),
      ),
    );
  }
  await db.delete(auditLog).where(inArray(auditLog.actorId, peopleIds));
  await db.delete(users).where(inArray(users.id, peopleIds));
  for (const { email } of [OWNER, PARTNER, LONER]) {
    const digest = createHash('sha256').update(email).digest('hex');
    await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  for (const { email, name } of [OWNER, PARTNER, LONER]) {
    const response = await fetch(`${GATEWAY}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD, name, termsVersion: TERMS_VERSION }),
    });
    expect(response.status, `signup for ${name}`).toBe(201);
    const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email));
    ids[email] = row!.id;
  }
  // Confirmed, and with the digest turned on, as Settings would leave them.
  await db!
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      preferences: sql`jsonb_set(${users.preferences}, '{notifications}', '{"weeklyDigest": true}'::jsonb)`,
    })
    .where(like(users.email, `${PREFIX}%`));

  // Signing in is what makes somebody's first board.
  for (const person of [OWNER, PARTNER, LONER]) {
    await (await signIn(browser, person.email)).context().close();
  }
  const [board] = await db!
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.ownerId, ids[OWNER.email]!));
  boardId = board!.id;
  await db!.insert(boardMembers).values({
    boardId,
    userId: ids[PARTNER.email]!,
    role: 'editor',
    grantedBy: ids[OWNER.email]!,
  });
});

test.afterAll(async () => {
  await cleanUp();
});

test('the sync-server counts who changed a board', async ({ browser }) => {
  const partner = await signIn(browser, PARTNER.email, `${EDITOR}/boards/${boardId}`);
  // Settled before drawing, and the tool picked from the toolbar rather than by
  // a key the page may not have focus for yet.
  await partner.waitForTimeout(2_000);
  await partner.getByTestId('toolbar-rectangle').check({ force: true });
  const box = (await partner.locator('canvas').last().boundingBox())!;
  await partner.mouse.move(box.x + 150, box.y + 150);
  await partner.mouse.down();
  await partner.mouse.move(box.x + 400, box.y + 320, { steps: 12 });
  await partner.mouse.up();
  await expect(partner.getByRole('button', { name: /^Undo/ })).toBeEnabled();

  // Added up about once a minute.
  await expect
    .poll(
      async () =>
        (
          await db!
            .select({ changes: boardActivity.changes })
            .from(boardActivity)
            .where(
              and(
                eq(boardActivity.boardId, boardId),
                eq(boardActivity.userId, ids[PARTNER.email]!),
              ),
            )
        ).length,
      { timeout: 90_000, intervals: [2_000] },
    )
    .toBe(1);
  await partner.context().close();
});

test('a dry run counts who would get one, and sends nothing', async () => {
  const counts = await dryRunWhenIdle();
  // The owner has news; the partner changed only somebody else's board, and
  // the loner has no boards anybody else touched.
  expect(counts.withNews).toBeGreaterThanOrEqual(1);
  expect(counts.emailed).toBe(0);
  for (const person of [OWNER, PARTNER, LONER]) expect(await digests(person.email)).toEqual([]);
});

test('a real run emails whoever has news, once a week', async () => {
  const started = await startDigest({});
  expect(started.status).toBe(202);
  await dryRunWhenIdle();

  expect(await digests(OWNER.email)).toEqual([true]);
  expect(await digests(PARTNER.email)).toEqual([]);
  expect(await digests(LONER.email)).toEqual([]);

  // Again the same week: nothing more.
  expect((await startDigest({})).status).toBe(202);
  await dryRunWhenIdle();
  expect(await digests(OWNER.email)).toEqual([true]);
});

test('the route takes only the scheduled job’s secret', async () => {
  expect((await startDigest({ dryRun: true }, '')).status).toBe(401);
  expect((await startDigest({ dryRun: true }, 'Bearer nope')).status).toBe(401);
  expect((await startDigest({ dryRun: true }, `${secret}`)).status).toBe(401);
});
