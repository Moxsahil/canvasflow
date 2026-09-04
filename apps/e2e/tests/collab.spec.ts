import { test, expect, type Page } from '@playwright/test';

/**
 * Two tabs on one board — the check that has been done by hand all along.
 *
 * Neither tab is given a board id. Both go to /open, which picks the signed-in
 * user's board (creating one on a fresh account) and redirects to the editor
 * with a freshly minted token. That keeps the test free of fixture ids that
 * would rot the moment the board they name is deleted.
 */
async function openBoard(page: Page): Promise<string> {
  await page.goto('http://localhost:3000/open');
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  return page.url();
}

test('two tabs land on the same board and both render a canvas', async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();

  const urlA = await openBoard(a);
  const urlB = await openBoard(b);

  // The token lives in the fragment and differs per mint, so compare only the
  // path — same board, two sessions.
  expect(new URL(urlA).pathname).toBe(new URL(urlB).pathname);

  await a.close();
  await b.close();
});

test('a shape drawn in one tab reaches the other', async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();

  await openBoard(a);
  await openBoard(b);

  // Settle first: a canvas that is still syncing its initial state would make
  // the "before" baseline a moving target.
  await b.waitForTimeout(2_000);
  const before = await b.locator('canvas').last().screenshot();

  await a.keyboard.press('r');
  const canvas = a.locator('canvas').last();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no box');

  await a.mouse.move(box.x + 150, box.y + 150);
  await a.mouse.down();
  await a.mouse.move(box.x + 400, box.y + 320, { steps: 12 });
  await a.mouse.up();

  // A canvas exposes no DOM to assert against, so the assertion is that B's
  // pixels changed — polled, because the sync is what is being timed.
  await expect(async () => {
    const after = await b.locator('canvas').last().screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);
  }).toPass({ timeout: 10_000 });

  await a.close();
  await b.close();
});
