import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

/**
 * Signs in once, so every other test starts with a live session.
 *
 * The login form has no <label> elements — the fields are placeholder-only —
 * so these locate by placeholder and input type rather than by label.
 */
setup('authenticate', async ({ page }) => {
  await page.goto('http://localhost:3000/login');

  // The profile the editor reads once it opens, which decides whether it asks
  // this account to agree to the terms. Watched from before signing in, so the
  // request cannot come and go unseen.
  const profileRead = page.waitForResponse(
    (response) =>
      response.url() === 'http://localhost:3000/api/me' && response.request().method() === 'GET',
    { timeout: 30_000 },
  );

  await page.locator('input[type="email"]').fill(process.env.E2E_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD!);

  // Anchored so it cannot match "Continue with Google"/"Continue with GitHub",
  // and so the disabled "Signing in..." state is not what gets clicked.
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Signing in lands on the editor, not the dashboard: /login sends the user
  // to /open, which picks (or creates) a board and redirects to the editor
  // origin with a token in the fragment. So the destination is :3002.
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });

  // Agree to the terms if asked, so no test after this one meets the notice
  // standing over the board. An account that has already agreed is not asked,
  // and the notice appears as soon as the profile says it should.
  await profileRead;
  const notice = page.getByTestId('terms-notice');
  const asked = await notice.waitFor({ state: 'visible', timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  if (asked) {
    await notice.getByRole('button', { name: 'Continue' }).click();
    await expect(notice).toBeHidden();
  }

  // Save the :3000 session cookie. The editor mints its own short-lived board
  // tokens from it, so this one cookie is all a later test needs.
  await page.context().storageState({ path: authFile });

  expect(page.url()).toContain('/boards/');
});
