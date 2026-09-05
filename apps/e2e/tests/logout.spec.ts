import { test, expect } from '@playwright/test';

/**
 * Signing out, end to end, across the two origins it spans.
 *
 * The interesting part is not the menu item: it is that a click in the editor
 * on :3002 ends a cookie on :3000, and that nothing usable is left behind on
 * either. So this asserts the three things that would each let a session
 * survive its own sign-out — the web session, the board tokens this tab
 * stashed, and being able to walk back into the app.
 *
 * The stored session on disk is untouched by this: it signs out the cookies in
 * this context only, and sessions are JWTs that nothing here revokes.
 */
test('signing out from the editor ends the session on the web app', async ({ browser }) => {
  const page = await browser.newPage();

  await page.goto('http://localhost:3000/open');
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  // Without the fragment: the token in it is spent, and re-opening this URL
  // later has to stand on the session alone.
  const boardUrl = new URL(page.url());
  boardUrl.hash = '';

  await page.getByTestId('menu-account').click();
  await page.getByTestId('menu-item-signOut').click();
  await page.getByTestId('sign-out-confirm').click();

  // The form POST to /logout answers 303 onto the login page.
  await page.waitForURL(/localhost:3000\/login/, { timeout: 30_000 });

  // The tokens minted for this tab's boards are gone with it. Read on the
  // editor origin, which is the only place sessionStorage for it exists —
  // arriving with no session leaves the board unable to mint a new one, so
  // anything found here would be a leftover.
  await page.goto(boardUrl.toString());
  const stashed = await page.evaluate(() =>
    Object.keys(window.sessionStorage).filter((key) => key.startsWith('editor:authToken:')),
  );
  expect(stashed).toEqual([]);

  // And the way back in is the login form: a protected page now redirects.
  await page.goto('http://localhost:3000/open');
  await page.waitForURL(/localhost:3000\/login/, { timeout: 30_000 });

  await page.close();
});
