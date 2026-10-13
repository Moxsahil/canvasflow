import { randomUUID } from 'node:crypto';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import { auditLog, createClient, memberships, users, workspaces } from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Pen mode, end to end, through the real editor on an emulated touch screen.
 *
 * A pen and a hand are driven through Chrome's own input emulation rather than
 * events made up in the page, so the browser hands the board real pointers —
 * which is what pointer capture, and telling one pointer from another, need.
 * What each step left behind is read off the stats panel's shape count.
 *
 * Needs the local web app, editor, gateway and sync-server running. Creates one
 * throwaway account through the real signup route, on Resend's test inbox so
 * nothing real is emailed, and removes it afterwards — which is why it reads
 * DATABASE_URL, from the repository's .env when it is not already set.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=pen
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EMAIL = `delivered+e2e-pen-${randomUUID().slice(0, 8)}@resend.dev`;
const PASSWORD = 'E2e!PenMode-one1';
/** Somewhere a link badge can lead that is local and opens in a new tab. */
const LINK = `${WEB}/terms`;

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ timeout: 120_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

test.beforeAll(async () => {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      name: 'E2E Pen',
      termsVersion: TERMS_VERSION,
    }),
  });
  expect(response.status, 'signup through the gateway').toBe(201);
});

test.afterAll(async () => {
  if (!db) return;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  if (!row) return;
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
});

type PenAction = 'mousePressed' | 'mouseMoved' | 'mouseReleased';
type TouchAction = 'touchStart' | 'touchMove' | 'touchEnd';
interface Spot {
  x: number;
  y: number;
}

const pen = (cdp: CDPSession, type: PenAction, { x, y }: Spot) =>
  cdp.send('Input.dispatchMouseEvent', {
    type,
    x,
    y,
    button: 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: 1,
    pointerType: 'pen',
    force: 0.5,
  });

/** One hand on the screen. Id 7, so it never shares an id with a finger. */
const PALM = 7;
const palm = (cdp: CDPSession, type: TouchAction, at?: Spot) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: at ? [{ ...at, id: PALM, radiusX: 30, radiusY: 30 }] : [],
  });

/** A pen stroke across the board, with a resting hand sliding along under it. */
async function penStroke(cdp: CDPSession, y: number, hand?: Spot) {
  await pen(cdp, 'mousePressed', { x: 200, y });
  for (let x = 220; x <= 420; x += 20) {
    await pen(cdp, 'mouseMoved', { x, y: y + Math.sin(x / 30) * 10 });
    if (hand) await palm(cdp, 'touchMove', { x: hand.x + (x - 200) / 4, y: hand.y });
  }
  await pen(cdp, 'mouseReleased', { x: 420, y });
}

/** A finger drawn straight across the board. */
async function fingerStroke(cdp: CDPSession, y: number) {
  const finger = (type: TouchAction, x?: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: x === undefined ? [] : [{ x, y, id: 1 }],
    });
  await finger('touchStart', 200);
  for (let x = 220; x <= 420; x += 20) await finger('touchMove', x);
  await finger('touchEnd');
}

const shapeCount = (page: Page) => page.getByLabel('Shapes', { exact: true });

test('a pen draws and a resting hand leaves the board alone', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  // The stats panel, for its shape count. Only on a first visit, so the
  // preferences the steps below change are not put back on a reload.
  await context.addInitScript(() => {
    if (!localStorage.getItem('cf:preferences')) {
      localStorage.setItem('cf:preferences', JSON.stringify({ canvasStats: true }));
    }
  });
  const page = await context.newPage();
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 45_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await expect(shapeCount(page)).toHaveText('0', { timeout: 15_000 });

  const cdp = await context.newCDPSession(page);
  // The radios sit under their icons, which take the click.
  const pickTool = (tool: string) => page.getByTestId(`toolbar-${tool}`).check({ force: true });
  await pickTool('freehand');

  await test.step('with pen mode off, a finger draws', async () => {
    await fingerStroke(cdp, 150);
    await expect(shapeCount(page)).toHaveText('1');
  });

  await test.step('the first pen turns pen mode on and takes back the hand that got there first', async () => {
    // Far enough for a stroke of its own, had it been kept.
    await palm(cdp, 'touchStart', { x: 700, y: 300 });
    for (let i = 1; i <= 8; i += 1)
      await palm(cdp, 'touchMove', { x: 700 + i * 10, y: 300 + i * 4 });
    await penStroke(cdp, 300, { x: 780, y: 332 });
    await palm(cdp, 'touchEnd');
    await expect(page.getByText('Pen mode on: only the pen draws')).toBeVisible();
    await expect(shapeCount(page)).toHaveText('2');
  });

  await test.step('in pen mode a finger draws nothing, and a resting hand nothing beside the pen', async () => {
    await fingerStroke(cdp, 450);
    await palm(cdp, 'touchStart', { x: 700, y: 600 });
    await penStroke(cdp, 600, { x: 700, y: 600 });
    await palm(cdp, 'touchEnd');
    await expect(shapeCount(page)).toHaveText('3');
  });

  await test.step('a pen double tap still opens a text box with a hand resting', async () => {
    await pickTool('select');
    await palm(cdp, 'touchStart', { x: 900, y: 650 });
    for (let i = 0; i < 2; i += 1) {
      await pen(cdp, 'mousePressed', { x: 900, y: 200 });
      await pen(cdp, 'mouseReleased', { x: 900, y: 200 });
    }
    await expect(page.locator('textarea')).toBeVisible();
    await palm(cdp, 'touchEnd');
    await page.keyboard.press('Escape');
  });

  await test.step('a hand on a link badge does not follow it; a pen does', async () => {
    // The first finger stroke, straight along y = 150, selected and linked.
    await page.mouse.click(300, 150);
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByTestId('link-box-input').fill(LINK);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    const badge = page.getByTestId('link-badge');
    await expect(badge).toBeVisible();
    const box = (await badge.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    const opened: Page[] = [];
    context.on('page', (tab) => opened.push(tab));
    await palm(cdp, 'touchStart', centre);
    await palm(cdp, 'touchEnd');
    await page.waitForTimeout(1000);
    expect(opened, 'a hand lifting off the badge opened the link').toHaveLength(0);

    const tab = context.waitForEvent('page');
    await pen(cdp, 'mousePressed', centre);
    await pen(cdp, 'mouseReleased', centre);
    await expect((await tab).url()).toBe(LINK);
  });

  await test.step('turned off in Preferences, a finger draws again and the next pen leaves it off', async () => {
    await page.getByTestId('menu-preferences').click();
    const row = page.getByTestId('preference-penMode');
    await expect(row).toHaveAttribute('aria-checked', 'true');
    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');

    await pickTool('freehand');
    await fingerStroke(cdp, 700);
    await expect(shapeCount(page)).toHaveText('4');
    await penStroke(cdp, 740);
    await expect(shapeCount(page)).toHaveText('5');
    const stored = await page.evaluate(() => localStorage.getItem('cf:preferences'));
    expect(JSON.parse(stored!).penMode).toBe(false);
  });
});
