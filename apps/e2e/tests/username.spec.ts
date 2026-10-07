import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  createClient,
  memberships,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Settings → Profile → Username, end to end, through the real editor.
 *
 * One account claims the name it is offered, is told what a name breaks and
 * when somebody else holds it, then changes it and finds it still there after
 * a reload. A second account exists only to hold a name the first cannot have.
 *
 * Needs the local web app, editor, gateway and sync-server running. Both
 * accounts are made through the real signup route, on Resend's test inbox so
 * nothing real is emailed, and removed afterwards — which is why it reads
 * DATABASE_URL, from the repository's .env when it is not already set.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=username
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'E2e!Username-one1';

const CLAIMER = { email: `delivered+e2e-username-${RUN}@resend.dev`, name: `E2E User ${RUN}` };
const HOLDER = { email: `delivered+e2e-holder-${RUN}@resend.dev`, name: `E2E Holder ${RUN}` };
/** What the claimer is offered: their name, as a username. */
const SUGGESTED = `e2e_user_${RUN}`;
/** Held by the second account, so the first cannot have it. */
const HELD = `held_${RUN}`;

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

async function signUp(person: { email: string; name: string }) {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ ...person, password: PASSWORD, termsVersion: TERMS_VERSION }),
  });
  expect(response.status, `signup for ${person.name}`).toBe(201);
}

/** A fresh browser, signed in through the real form, with a board open. */
async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  return page;
}

/**
 * Every availability check the page completes, as the names each one asked
 * about. Completed, because a development build runs each effect twice and
 * cancels the first request at once; that one never costs the server anything.
 */
function watchChecks(page: Page): string[][] {
  const checks: string[][] = [];
  page.on('requestfinished', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/users/me/username') {
      checks.push(url.searchParams.getAll('name'));
    }
  });
  return checks;
}

/** Settings, which opens on Profile, and its username row. */
async function openUsername(page: Page) {
  await page.getByTestId('menu-account').click();
  await page.getByTestId('menu-item-settings').click();
  const pane = page.getByTestId('settings-dialog');
  const row = pane.locator('[data-setting="username"]');
  return { pane, row, field: row.getByLabel('Username', { exact: true }) };
}

async function usernameOf(email: string): Promise<string | null> {
  const [row] = await db!
    .select({ username: users.username })
    .from(users)
    .where(eq(users.email, email));
  return row?.username ?? null;
}

test.beforeAll(async () => {
  await signUp(CLAIMER);
  await signUp(HOLDER);
  // Held straight in the database: how the holder came by it is not what
  // this is about.
  await db!.update(users).set({ username: HELD }).where(eq(users.email, HOLDER.email));
});

test.afterAll(async () => {
  if (!db) return;
  for (const { email } of [CLAIMER, HOLDER]) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (row) {
      // Boards name their owner without a cascade, so the workspaces go first.
      const owned = await db
        .select({ workspaceId: memberships.workspaceId })
        .from(memberships)
        .where(eq(memberships.userId, row.id));
      if (owned.length > 0) {
        await db.delete(workspaces).where(
          inArray(
            workspaces.id,
            owned.map((m) => m.workspaceId),
          ),
        );
      }
      await db.delete(auditLog).where(eq(auditLog.actorId, row.id));
      await db.delete(users).where(eq(users.id, row.id));
    }
    const digest = createHash('sha256').update(email).digest('hex');
    await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
  }
});

test('offers a name made from yours, and keeps it once claimed', async ({ browser }) => {
  const page = await signedIn(browser, CLAIMER.email);
  const checks = watchChecks(page);
  const { pane, row, field } = await openUsername(page);

  await expect(field).toHaveValue(SUGGESTED, { timeout: 15_000 });
  await expect(row.getByText('Suggested for you, and available')).toBeVisible();
  // The suggestion and its fallbacks in one request, and the field's own check
  // of the suggestion answered from that, without asking again.
  expect(checks).toHaveLength(1);
  expect(checks[0]![0]).toBe(SUGGESTED);
  expect(checks[0]).toHaveLength(10);
  // Offered, not given: nothing is stored until it is claimed.
  expect(await usernameOf(CLAIMER.email)).toBeNull();

  await row.getByRole('button', { name: 'Save' }).click();
  await expect(pane.locator('section[aria-label="Identity"]').getByText('Saved')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Save' })).toHaveCount(0);
  expect(await usernameOf(CLAIMER.email)).toBe(SUGGESTED);
});

test('says what is wrong with a name before anything is sent', async ({ browser }) => {
  const page = await signedIn(browser, CLAIMER.email);
  const { row, field } = await openUsername(page);
  await expect(field).toHaveValue(SUGGESTED, { timeout: 15_000 });

  // Typed in capitals, and kept as it will be stored.
  await field.fill('');
  await field.pressSequentially('Ab');
  await expect(field).toHaveValue('ab');
  await expect(row.getByText('Use at least 3 characters.')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Save' })).toBeDisabled();

  await field.fill('ada lovelace');
  await expect(row.getByText('Use only letters, numbers, underscores and periods.')).toBeVisible();

  await field.fill('admin');
  await expect(row.getByText('That username is reserved.')).toBeVisible();

  // Escape puts the saved one back.
  await field.press('Escape');
  await expect(field).toHaveValue(SUGGESTED);
});

test('will not give out a name somebody else holds', async ({ browser }) => {
  const page = await signedIn(browser, CLAIMER.email);
  const { row, field } = await openUsername(page);
  await expect(field).toHaveValue(SUGGESTED, { timeout: 15_000 });

  await field.fill(HELD);
  await expect(row.getByText('That username is taken.')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Save' })).toBeDisabled();

  // Past the field, the gateway still refuses: the save is what decides.
  const status = await page.evaluate(
    async ({ gateway, name }) =>
      (
        await fetch(`${gateway}/users/me/username`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name }),
        })
      ).status,
    { gateway: GATEWAY, name: HELD.toUpperCase() },
  );
  expect(status).toBe(409);
  expect(await usernameOf(CLAIMER.email)).toBe(SUGGESTED);
});

test('changes to a free name, and still has it after a reload', async ({ browser }) => {
  const page = await signedIn(browser, CLAIMER.email);
  const { pane, row, field } = await openUsername(page);
  await expect(field).toHaveValue(SUGGESTED, { timeout: 15_000 });

  const next = `e2e.${RUN}`;
  await field.fill(next);
  await expect(row.getByText('Available', { exact: true })).toBeVisible();
  await field.press('Enter');
  await expect(pane.locator('section[aria-label="Identity"]').getByText('Saved')).toBeVisible();
  expect(await usernameOf(CLAIMER.email)).toBe(next);

  await page.reload();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  const again = await openUsername(page);
  await expect(again.field).toHaveValue(next, { timeout: 15_000 });
});

test('asks about each name once: going back to one answers from memory', async ({ browser }) => {
  const page = await signedIn(browser, CLAIMER.email);
  const checks = watchChecks(page);
  const { row, field } = await openUsername(page);
  await expect(field).toHaveValue(`e2e.${RUN}`, { timeout: 15_000 });

  const free = `free.${RUN}`;
  await field.fill(free);
  await expect(row.getByText('Available', { exact: true })).toBeVisible();
  await field.fill(HELD);
  await expect(row.getByText('That username is taken.')).toBeVisible();
  expect(checks).toEqual([[free], [HELD]]);

  // Back to both: answered at once, and nothing more is asked.
  await field.fill(free);
  await expect(row.getByText('Available', { exact: true })).toBeVisible();
  await field.fill(HELD);
  await expect(row.getByText('That username is taken.')).toBeVisible();
  expect(checks).toHaveLength(2);
});
