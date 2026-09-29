import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { eq, inArray, or } from 'drizzle-orm';
import {
  accountDeletions,
  accounts,
  auditLog,
  authSessions,
  boards,
  createClient,
  memberships,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Settings → Data & Privacy → Delete account, end to end, through the real
 * editor.
 *
 * Two throwaway accounts, made through the real signup route on Resend's test
 * inbox so nothing real is emailed. Pat has a password: a wrong one is refused
 * in the dialog, the right one lands on the confirmation page. Gee is made the
 * same way, then turned into a Google-only account in the database — password
 * gone, a Google link added — so the "sign in again" step can be driven
 * without Google: the way out is caught before it leaves, and the way back is
 * a reload with the note the dialog left.
 *
 * Needs the local web app, editor, gateway and sync-server running, and the
 * development database in DATABASE_URL, from the repository's .env when unset.
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
const PAT = `delivered+e2e-delete-ui-pat-${suffix}@resend.dev`;
const GEE = `delivered+e2e-delete-ui-gee-${suffix}@resend.dev`;
const PASSWORD = 'E2e!Deletion-one1';

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

// Two sign-ins, password checks and a remote development database: well over
// Playwright's default half a minute on a laptop.
test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

const made = { pat: '', gee: '' };

async function signUp(email: string, name: string): Promise<string> {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    // Agreed at signup, so the terms notice stays out of the way.
    body: JSON.stringify({ email, password: PASSWORD, name, termsVersion: TERMS_VERSION }),
  });
  expect(response.status, 'signup through the gateway').toBe(201);
  const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email));
  return row!.id;
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

/** Settings → Data & Privacy → Delete account, and the dialog it opens. */
async function openDeleteDialog(page: Page) {
  await page.getByTestId('menu-account').click();
  await page.getByTestId('menu-item-settings').click();
  await page.getByTestId('settings-tab-privacy').click();
  await page.getByTestId('settings-dialog').getByRole('button', { name: 'Delete account' }).click();
  return deleteDialog(page);
}

function deleteDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Delete your account?' });
}

async function scheduled(userId: string) {
  const [row] = await db!
    .select({ status: accountDeletions.status })
    .from(accountDeletions)
    .where(eq(accountDeletions.userId, userId));
  return row?.status ?? null;
}

test.beforeAll(async () => {
  made.pat = await signUp(PAT, 'E2E Delete Pat');
  made.gee = await signUp(GEE, 'E2E Delete Gee');
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

test('a password account types its address, is refused a wrong password, then deletes', async ({
  browser,
}) => {
  const page = await signedIn(browser, PAT);
  const dialog = await openDeleteDialog(page);

  // Straight onto the confirmation: no loading step, the one paragraph that
  // says what happens, and none of the lists of what goes.
  await expect(dialog.getByText(`To confirm, type ${PAT}`)).toBeVisible();
  await expect(page.getByText('Checking what would be deleted')).toHaveCount(0);
  await expect(
    dialog.getByText('Your account is locked and you’re signed out everywhere straight away.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(dialog.getByText('shown as “Deleted user”', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'support@canvasflowapp.com' })).toBeVisible();
  for (const gone of ['What will be deleted', 'Shared boards']) {
    await expect(dialog.getByText(gone, { exact: false }), gone).toHaveCount(0);
  }

  const confirm = dialog.getByLabel('Type your email address to confirm');
  const password = dialog.getByLabel('Password', { exact: true });
  const remove = dialog.getByRole('button', { name: 'Delete account' });

  // Nothing to press until both are filled in.
  await expect(remove).toBeDisabled();
  await confirm.fill(PAT.toUpperCase());
  await expect(remove).toBeDisabled();
  await password.fill('not-the-password');
  await expect(remove).toBeEnabled();

  await remove.click();
  await expect(dialog.getByRole('alert')).toHaveText('Incorrect password.', {
    timeout: 20_000,
  });
  expect(await scheduled(made.pat)).toBeNull();

  await password.fill(PASSWORD);
  await remove.click();

  await page.waitForURL(/localhost:3000\/account-deleted\?until=/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Your account will be deleted.' })).toBeVisible();
  await expect(
    page.getByText(/everything in it after \d{1,2} \w+ \d{4} at \d{2}:\d{2} UTC/),
  ).toBeVisible();
  expect(await scheduled(made.pat)).toBe('scheduled');

  // Every session ended with it: this browser is signed out.
  await page.goto(`${WEB}/open`);
  await page.waitForURL(/localhost:3000\/login/, { timeout: 30_000 });
});

test('a Google-only account signs in again first, comes back to the dialog, then deletes', async ({
  browser,
}) => {
  const page = await signedIn(browser, GEE);

  // Now an account that signs in only with Google, whose sign-in is 11 minutes old.
  await db!.update(users).set({ passwordHash: null }).where(eq(users.id, made.gee));
  await db!.insert(accounts).values({
    userId: made.gee,
    type: 'oidc',
    provider: 'google',
    providerAccountId: `e2e-delete-ui-${suffix}`,
  });
  await db!
    .update(authSessions)
    .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(authSessions.userId, made.gee));

  const dialog = await openDeleteDialog(page);
  await expect(
    dialog.getByText('For your safety, sign in again first.', { exact: false }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog.getByRole('button', { name: 'Delete account' })).toHaveCount(0);

  // The way out, caught before it reaches Google: a 204 leaves the page where it is.
  await page.route(`${GATEWAY}/auth/oauth/**`, (route) => route.fulfill({ status: 204 }));
  const leaving = page.waitForRequest(`${GATEWAY}/auth/oauth/**`);
  await dialog.getByRole('button', { name: 'Continue with Google' }).click();
  const url = new URL((await leaving).url());
  expect(url.pathname).toBe('/auth/oauth/google');
  expect(url.searchParams.get('next')).toBe('/open');
  // The dialog showed no terms, so it claims no agreement to them.
  expect(url.searchParams.has('terms')).toBe(false);
  await page.unroute(`${GATEWAY}/auth/oauth/**`);

  // The way back: a fresh sign-in, and the editor loading again in this tab.
  await db!
    .update(authSessions)
    .set({ createdAt: new Date() })
    .where(eq(authSessions.userId, made.gee));
  await page.reload();

  const back = deleteDialog(page);
  await expect(back.getByText('No password needed: you signed in a few minutes ago.')).toBeVisible({
    timeout: 30_000,
  });
  await back.getByLabel('Type your email address to confirm').fill(GEE);
  await back.getByRole('button', { name: 'Delete account' }).click();

  await page.waitForURL(/localhost:3000\/account-deleted\?until=/, { timeout: 30_000 });
  expect(await scheduled(made.gee)).toBe('scheduled');
});

test('the confirmation page opens signed out, and ignores a date nobody could believe', async ({
  page,
}) => {
  await page.goto(`${WEB}/account-deleted?until=2099-01-01T00:00:00.000Z`);
  await expect(page.getByRole('heading', { name: 'Your account will be deleted.' })).toBeVisible();
  await expect(page.getByText('everything in it in 7 days')).toBeVisible();
  await expect(page.getByRole('link', { name: 'support@canvasflowapp.com' })).toHaveAttribute(
    'href',
    'mailto:support@canvasflowapp.com',
  );
});
