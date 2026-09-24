import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  createClient,
  memberships,
  passwordResetRequests,
  passwordResetTokens,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';

/**
 * Forgot password and reset password, through the real pages, end to end.
 *
 * The reset link only ever exists inside an email, so this writes its own —
 * the same shape the gateway writes: 32 random bytes in the link, only their
 * SHA-256 stored — straight into the database. Everything else goes through
 * the browser exactly as a person would: the login page, the forgot page, the
 * reset page, and a second browser that was signed in before the reset.
 *
 * Needs the local web app, editor, gateway and sync-server running, and the
 * development database in DATABASE_URL — read from the repository's .env when
 * it is not already set. Creates one throwaway account on Resend's test inbox,
 * so nothing real is emailed, and removes it afterwards.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=recovery
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EMAIL = `delivered+e2e-reset-${randomUUID().slice(0, 8)}@resend.dev`;
const OLD_PASSWORD = 'E2e!Reset-old1';
const NEW_PASSWORD = 'E2e!Reset-new2';
const THIRD_PASSWORD = 'E2e!Reset-third3';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

// One account moves through these in order, so a failure part-way leaves the
// rest nothing sensible to run against; skip them rather than report noise.
test.describe.configure({ mode: 'serial' });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

async function userId(): Promise<string> {
  const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  if (!row) throw new Error('The test account was not created');
  return row.id;
}

/** A working reset link for the test account, as the gateway would mint one. */
async function mintResetLink(): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db!.insert(passwordResetTokens).values({
    userId: await userId(),
    tokenHash: digest(token),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  return `${WEB}/reset-password#token=${token}`;
}

async function signInThroughTheForm(page: Page, password: string) {
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
}

test.beforeAll(async () => {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ email: EMAIL, password: OLD_PASSWORD, name: 'E2E Reset' }),
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
  await db.delete(passwordResetRequests).where(eq(passwordResetRequests.emailHash, digest(EMAIL)));
  await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest(EMAIL)));
});

test('asking for a reset link from the login page', async ({ page }) => {
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByRole('link', { name: 'Forgot password?' }).click();

  // The address typed on the login page comes along.
  await page.waitForURL(/\/forgot-password/);
  await expect(page.getByLabel('Email')).toHaveValue(EMAIL);

  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible();
  // Worded so it is true whether or not the address has an account.
  await expect(page.getByText(`If an account exists for ${EMAIL}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send another link' })).toBeDisabled();

  // The gateway issues the link after it has replied.
  const id = await userId();
  await expect
    .poll(
      async () =>
        (
          await db!
            .select({ id: passwordResetTokens.id })
            .from(passwordResetTokens)
            .where(eq(passwordResetTokens.userId, id))
        ).length,
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
});

test('choosing a new password signs out every device, and the new one works', async ({
  browser,
}) => {
  // A second device, signed in before the reset, with a board open.
  const otherDevice = await browser.newPage();
  await signInThroughTheForm(otherDevice, OLD_PASSWORD);
  await otherDevice.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });

  const page = await browser.newPage();
  await page.goto(await mintResetLink());

  // The form, for the right account, with the token already out of the URL.
  await expect(page.getByRole('heading', { name: 'Choose a new password.' })).toBeVisible();
  await expect(page.getByText(`For ${EMAIL}`)).toBeVisible();
  expect(page.url()).not.toContain('token');

  // Update stays off until both fields match and the rules are met.
  const update = page.getByRole('button', { name: 'Update password' });
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Confirm new password', { exact: true }).fill(`${NEW_PASSWORD}x`);
  await expect(update).toBeDisabled();
  await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD);
  await expect(update).toBeEnabled();
  await update.click();

  await expect(page.getByRole('heading', { name: 'Password updated.' })).toBeVisible();

  // The other device's editor is told its session is over and goes to sign in.
  await otherDevice.waitForURL(/localhost:3000\/login/, { timeout: 20_000 });

  // Signing in: offered the address, told what happened, and the new password works.
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/login\?reset=1/);
  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();
  await expect(page.getByPlaceholder('you@example.com')).toHaveValue(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });

  // And the old password is gone.
  const old = await fetch(`${GATEWAY}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ email: EMAIL, password: OLD_PASSWORD }),
  });
  expect(old.status).toBe(401);

  await otherDevice.close();
  await page.close();
});

test('a link works once', async ({ page }) => {
  const link = await mintResetLink();

  await page.goto(link);
  // Different from every earlier password, so this is judged on the link alone.
  await page.getByLabel('New password', { exact: true }).fill(THIRD_PASSWORD);
  await page.getByLabel('Confirm new password', { exact: true }).fill(THIRD_PASSWORD);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated.' })).toBeVisible();

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'This link is no longer valid.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send a new link' })).toBeVisible();
});
