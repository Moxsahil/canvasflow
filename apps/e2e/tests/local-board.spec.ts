import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
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
 * The board at the editor's own address, which anyone can draw on without an
 * account: it opens straight away, keeps what is drawn across a reload, asks
 * for an account when shared, and points someone already signed in at their
 * own boards.
 *
 * Needs the local web app, editor and gateway running. The signed-in half
 * creates one throwaway account through the real signup route, on Resend's
 * test inbox so nothing real is emailed, and removes it afterwards — which is
 * why it reads DATABASE_URL, from the repository's .env when it is not set.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=local
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const EDITOR = 'http://localhost:3002';
const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EMAIL = `delivered+e2e-local-${randomUUID().slice(0, 8)}@resend.dev`;
const PASSWORD = 'E2e!Local-board1';

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

/** Write some words on the board, where a search can find them again. */
async function writeOnBoard(page: Page, words: string) {
  await page.keyboard.press('t');
  await page.mouse.click(400, 500);
  await page.keyboard.type(words);
  // Clicking away commits the text.
  await page.mouse.click(1000, 650);
}

async function findOnBoard(page: Page, words: string) {
  await page.keyboard.press('ControlOrMeta+f');
  await page.getByPlaceholder('Find on canvas').fill(words);
}

test('draws without an account and keeps the drawing across a reload', async ({ page }) => {
  await page.goto(`${EDITOR}/`);
  // Opened where it was asked for, not redirected anywhere.
  await expect(page).toHaveURL(`${EDITOR}/`);
  await expect(page.getByTestId('local-account-button')).toHaveText('Sign in');

  await writeOnBoard(page, 'Kept in this browser');
  // IndexedDB writes as the board changes; a moment lets the last one land.
  await page.waitForTimeout(500);
  await page.reload();

  await findOnBoard(page, 'Kept in this browser');
  await expect(page.getByText('1/1')).toBeVisible();
});

test('asks for an account when the board is shared', async ({ page }) => {
  await page.goto(`${EDITOR}/`);
  await page.getByRole('button', { name: /share/i }).click();
  const prompt = page.getByTestId('sign-up-prompt');
  await expect(prompt.getByText('Sharing needs an account')).toBeVisible();
  await expect(prompt.getByRole('button', { name: 'Create account' })).toBeVisible();
  await prompt.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/localhost:3000\/login\?next=\/open/);
});

test.describe('signed in', () => {
  test.skip(!db, 'DATABASE_URL is not set');

  test.beforeAll(async () => {
    const response = await fetch(`${GATEWAY}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({
        email: EMAIL,
        password: PASSWORD,
        name: 'E2E Local',
        termsVersion: TERMS_VERSION,
      }),
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

  test('signing in from the share prompt brings the drawing into the account', async ({ page }) => {
    await page.goto(`${EDITOR}/`);
    await writeOnBoard(page, 'Carried on sign in');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /share/i }).click();
    await page.getByTestId('sign-up-prompt').getByRole('button', { name: 'Sign in' }).click();
    // A full navigation to the web app: wait for its form to be ready to type in.
    await page.waitForURL(/localhost:3000\/login/);
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });

    // A new account's first board was empty, so the drawing is put on it, and
    // the share window it was brought over for opens.
    await expect(page.getByTestId('toast')).toContainText('now in your account', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('share-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await findOnBoard(page, 'Carried on sign in');
    await expect(page.getByText('1/1')).toBeVisible();
    // The next test finds this board taken. Closing the page the instant the
    // edit is made can beat the sync-server to storing it.
    await page.waitForTimeout(3000);
  });

  test('someone signed in moves a changed drawing onto a board of its own', async ({ page }) => {
    await page.goto(`${WEB}/login`);
    await page.getByPlaceholder('you@example.com').fill(EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
    const firstBoard = page.url().split('#')[0];

    // Signed in, the editor's own address is still the local board.
    await page.goto(`${EDITOR}/`);
    await expect(page).toHaveURL(`${EDITOR}/`);
    await expect(page.getByTestId('local-account-button')).toHaveText('Your boards', {
      timeout: 15_000,
    });
    await writeOnBoard(page, 'Moved while signed in');
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /share/i }).click();
    await page
      .getByTestId('sign-up-prompt')
      .getByRole('button', { name: 'Move to my account' })
      .click();

    // The account's last board has the earlier drawing on it, so this one gets
    // a board of its own rather than being mixed in.
    await page.waitForURL(
      (url) => /\/boards\//.test(url.pathname) && url.href.split('#')[0] !== firstBoard,
      {
        timeout: 30_000,
      },
    );
    await expect(page.getByTestId('toast')).toContainText('now in your account', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('share-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await findOnBoard(page, 'Moved while signed in');
    await expect(page.getByText('1/1')).toBeVisible();
    const moved = page.url().split('#')[0];
    await page.waitForTimeout(3000);

    // Moved again unchanged, it is not brought along a second time: the
    // account's last board, the one it went to, opens with nothing new made.
    await page.goto(`${EDITOR}/`);
    await page.getByRole('button', { name: /share/i }).click();
    await page
      .getByTestId('sign-up-prompt')
      .getByRole('button', { name: 'Move to my account' })
      .click();
    await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3000);
    expect(page.url().split('#')[0]).toBe(moved);
    await expect(page.getByTestId('toast')).toHaveCount(0);
    await expect(page.getByTestId('share-dialog')).toHaveCount(0);
  });
});
