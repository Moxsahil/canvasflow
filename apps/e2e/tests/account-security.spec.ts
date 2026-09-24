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

/**
 * Settings → Account & Security, end to end, through the real editor.
 *
 * Signs in on two devices (two browser contexts) so the pane has something to
 * list and something to sign out: the device list, changing the password with
 * the other device signed out, a wrong current password, and signing out
 * everywhere.
 *
 * Needs the local web app, editor, gateway and sync-server running. Creates one
 * throwaway account through the real signup route, on Resend's test inbox so
 * nothing real is emailed, and removes it afterwards — which is why it reads
 * DATABASE_URL, from the repository's .env when it is not already set.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=account
 *   pnpm --filter @canvasflow/e2e test:e2e:ui --project=account     (watch it)
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EMAIL = `delivered+e2e-account-${randomUUID().slice(0, 8)}@resend.dev`;
const FIRST_PASSWORD = 'E2e!Account-one1';
const SECOND_PASSWORD = 'E2e!Account-two2';

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

/**
 * How long to wait for a password change to answer. It runs bcrypt three times
 * (check the current password, refuse the same one again, hash the new one) and
 * a dozen database round trips — well over a second from a laptop to a remote
 * development database, more with two browsers and three dev servers running.
 */
const PASSWORD_CHANGE = { timeout: 20_000 };

// One account moves through these in order: the password each test signs in
// with depends on the one before it having changed it.
test.describe.configure({ mode: 'serial' });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

let password = FIRST_PASSWORD;

/** A fresh browser, signed in through the real form, with a board open. */
async function signedInDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  return page;
}

/** Settings → Account & Security, once its numbers have loaded. */
async function openAccountPane(page: Page) {
  await page.getByTestId('menu-account').click();
  await page.getByTestId('menu-item-settings').click();
  await page.getByTestId('settings-nav-account').click();
  const pane = page.getByTestId('settings-dialog');
  await expect(pane.getByText(/devices? signed in right now/)).toBeVisible({ timeout: 15_000 });
  return pane;
}

test.beforeAll(async () => {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ email: EMAIL, password: FIRST_PASSWORD, name: 'E2E Account' }),
  });
  expect(response.status, 'signup through the gateway').toBe(201);
});

test.afterAll(async () => {
  if (!db) return;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
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
  const digest = createHash('sha256').update(EMAIL).digest('hex');
  await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
});

test('the pane shows the account as it really is, on every device', async ({ browser }) => {
  const other = await signedInDevice(browser);
  const page = await signedInDevice(browser);
  const pane = await openAccountPane(page);

  await expect(pane.getByText('2 devices signed in right now')).toBeVisible();
  await expect(pane.getByText(/Unchanged since you signed up on/)).toBeVisible();
  await expect(pane.getByText('Email and password', { exact: true })).toBeVisible();
  await expect(pane.getByText('Coming soon')).toBeVisible();

  // View all: both devices, this one marked, each with the day it signed in.
  await pane.getByRole('button', { name: 'View all' }).click();
  const sessions = page.getByRole('dialog', { name: 'Active sessions' });
  await expect(sessions.locator('li')).toHaveCount(2);
  await expect(sessions.getByText('This device')).toHaveCount(1);
  await expect(sessions.getByText(/Active since \d{1,2} [A-Z][a-z]{2} \d{4}/)).toHaveCount(2);
  await sessions.getByRole('button', { name: 'Done' }).click();

  // Manage: every way in, and which are connected.
  await pane.getByRole('button', { name: 'Manage' }).click();
  const accounts = page.getByRole('dialog', { name: 'Connected accounts' });
  await expect(accounts.locator('li')).toHaveCount(3);
  await expect(accounts.getByText('Not connected')).toHaveCount(2);
  await accounts.getByRole('button', { name: 'Done' }).click();

  await other.context().close();
  await page.context().close();
});

test('changing the password signs out the other device and keeps this one', async ({ browser }) => {
  const other = await signedInDevice(browser);
  const page = await signedInDevice(browser);
  const pane = await openAccountPane(page);

  await pane.getByRole('button', { name: 'Change', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Change password' });
  await form.getByLabel('Current password', { exact: true }).fill(password);
  await form.getByLabel('New password', { exact: true }).fill(SECOND_PASSWORD);

  // Change stays off until both new-password fields match.
  await form.getByLabel('Confirm new password', { exact: true }).fill(`${SECOND_PASSWORD}x`);
  await expect(form.getByRole('button', { name: 'Change password' })).toBeDisabled();
  await form.getByLabel('Confirm new password', { exact: true }).fill(SECOND_PASSWORD);

  await expect(form.getByRole('checkbox')).toBeChecked();
  await form.getByRole('button', { name: 'Change password' }).click();

  const changed = page.getByRole('dialog', { name: 'Password changed' });
  await expect(
    changed.getByText('Every other device has been signed out. This one stays signed in.'),
  ).toBeVisible(PASSWORD_CHANGE);
  password = SECOND_PASSWORD;

  // The other device's editor is told its session ended and goes to sign in.
  await other.waitForURL(/localhost:3000\/login/, { timeout: 20_000 });

  // This one stays, and the row now says the password just changed.
  await changed.getByRole('button', { name: 'Done' }).click();
  await expect(pane.getByText('Last changed just now')).toBeVisible(PASSWORD_CHANGE);
  expect(page.url()).toContain('localhost:3002/boards/');

  await other.context().close();
  await page.context().close();
});

test('a wrong current password is refused and changes nothing', async ({ browser }) => {
  const page = await signedInDevice(browser);
  const pane = await openAccountPane(page);

  await pane.getByRole('button', { name: 'Change', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Change password' });
  await form.getByLabel('Current password', { exact: true }).fill('Not!The-password1');
  await form.getByLabel('New password', { exact: true }).fill('E2e!Account-three3');
  await form.getByLabel('Confirm new password', { exact: true }).fill('E2e!Account-three3');
  await form.getByRole('button', { name: 'Change password' }).click();

  await expect(form.getByRole('alert')).toHaveText(
    'Your current password is not right.',
    PASSWORD_CHANGE,
  );
  await form.getByRole('button', { name: 'Cancel' }).click();

  await page.context().close();
});

test('sign out everywhere signs out every device, this one too', async ({ browser }) => {
  const other = await signedInDevice(browser);
  const page = await signedInDevice(browser);
  const pane = await openAccountPane(page);

  await pane.getByRole('button', { name: 'Sign out all' }).click();
  const confirm = page.getByRole('dialog', { name: 'Sign out everywhere?' });
  // Every session the earlier tests started is still live, so the count is
  // more than the two browsers open here.
  await expect(confirm.getByText(/all \d+ devices, including this one/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Sign out all' }).click();

  await page.waitForURL(/localhost:3000\/login/, { timeout: 20_000 });
  await other.waitForURL(/localhost:3000\/login/, { timeout: 20_000 });

  await other.context().close();
  await page.context().close();
});
