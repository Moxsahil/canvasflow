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

/** Sign in through the web app's form, landing on the account's last board. */
async function signIn(page: Page) {
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  // Up and running, so the editor has noted that an account is in this browser.
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem('canvasflow:account-here')))
    .toBe('1');
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

test('tells search engines what the editor is, and where to find it', async ({ page, request }) => {
  await page.goto(`${EDITOR}/`);
  await expect(page).toHaveTitle('CanvasFlow Whiteboard');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://app.canvasflowapp.com/',
  );
  const robots = await request.get(`${EDITOR}/robots.txt`);
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain('Sitemap: https://app.canvasflowapp.com/sitemap.xml');
  const sitemap = await request.get(`${EDITOR}/sitemap.xml`);
  expect(await sitemap.text()).toContain('<loc>https://app.canvasflowapp.com/</loc>');

  // The home page links to it, so a crawler can get there.
  await page.goto(`${WEB}/`);
  await expect(page.getByRole('link', { name: 'Open canvas' }).first()).toHaveAttribute(
    'href',
    `${EDITOR}/`,
  );
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

  test('an account signed in here opens its own board, even after the short pass lapses', async ({
    page,
  }) => {
    await signIn(page);
    const lastBoard = page.url().split('#')[0];

    // Days later: the 15-minute access cookie is long gone, the refresh cookie
    // is not. The address still opens the account's own board, not the local one.
    await page.context().clearCookies({ name: 'cf.access' });
    await page.goto(`${EDITOR}/`);
    await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
    expect(page.url().split('#')[0]).toBe(lastBoard);
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('local-account-button')).toHaveCount(0);
    // The loader stays only until the board's content has arrived.
    await expect(page.getByTestId('board-loading')).toHaveCount(0, { timeout: 15_000 });

    // Signed out, the address opens the local board again, straight away.
    await page.getByTestId('menu-account').click();
    await page.getByTestId('menu-item-signOut').click();
    await page.getByTestId('sign-out-confirm').click();
    await page.waitForURL(/localhost:3000/, { timeout: 30_000 });
    await page.goto(`${EDITOR}/`);
    await expect(page).toHaveURL(`${EDITOR}/`);
    await expect(page.getByTestId('local-account-button')).toHaveText('Sign in');
  });

  test('a drawing left on the local board comes along when the account opens the address', async ({
    page,
  }) => {
    await signIn(page);
    const lastBoard = page.url().split('#')[0];

    // A browser that has never opened a board for this account: the local
    // board shows, offering the account's boards, and gets drawn on.
    await page.evaluate(() => window.localStorage.removeItem('canvasflow:account-here'));
    await page.goto(`${EDITOR}/`);
    await expect(page.getByTestId('local-account-button')).toHaveText('Your boards', {
      timeout: 15_000,
    });
    await writeOnBoard(page, 'Brought along on arrival');
    await page.waitForTimeout(500);

    // Next visit the address knows the account, and the drawing comes with it:
    // onto a board of its own, since the account's last board has work on it.
    await page.goto(`${EDITOR}/`);
    await page.waitForURL(
      (url) => /\/boards\//.test(url.pathname) && url.href.split('#')[0] !== lastBoard,
      { timeout: 30_000 },
    );
    await expect(page.getByTestId('toast')).toContainText('now in your account', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('share-dialog')).toHaveCount(0);
    // The tab names the board it was moved to, not the editor's search title.
    await expect(page).toHaveTitle('Drawing from this browser — CanvasFlow');
    await findOnBoard(page, 'Brought along on arrival');
    await expect(page.getByText('1/1')).toBeVisible();
    await page.keyboard.press('Escape');
    const moved = page.url().split('#')[0];
    await page.waitForTimeout(3000);

    // Unchanged, it is not brought along a second time: the address opens the
    // board it went to, with nothing new made.
    await page.goto(`${EDITOR}/`);
    await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(3000);
    expect(page.url().split('#')[0]).toBe(moved);
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });
});
