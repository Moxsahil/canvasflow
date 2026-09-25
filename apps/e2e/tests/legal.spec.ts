import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { boardShareLinks, boards, createClient, users, workspaces } from '@canvasflow/db';

/**
 * The Terms of Service, and every place that says continuing means agreeing to
 * them, as someone who has never signed in sees them.
 *
 * The terms have to open without an account — they are read before one exists
 * — and each way into CanvasFlow has to point at them: signup, sign-in (whose
 * Google and GitHub buttons create an account for anybody new) and a share
 * link's guest form.
 *
 * Needs the local web app running. The share-link case also needs the
 * development database in DATABASE_URL — read from the repository's .env when
 * it is not already set — to make a throwaway board and link, the same shape
 * the gateway writes, which it removes afterwards. Nothing is joined, so the
 * link is never used.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=legal
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the share-link case says which.
}

const WEB = 'http://localhost:3000';

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test('the terms open for someone who is not signed in', async ({ page }) => {
  const response = await page.goto(`${WEB}/terms`);

  expect(response?.status()).toBe(200);
  // A redirect would land on sign-in, or on the gateway renewing a session.
  await expect(page).toHaveURL(`${WEB}/terms`);
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
});

test('the home page footer leads to the terms', async ({ page }) => {
  await page.goto(`${WEB}/`);
  await page.getByRole('contentinfo').getByRole('link', { name: 'Terms', exact: true }).click();

  await expect(page).toHaveURL(`${WEB}/terms`);
});

test('signing up means agreeing, and the terms open beside the form', async ({ page }) => {
  await page.goto(`${WEB}/signup`);
  await expect(page.getByText(/by continuing, you agree to our/i)).toBeVisible();

  // In a new tab, so what has been typed into the form survives the detour.
  const [terms] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: /terms of service/i }).click(),
  ]);
  await expect(terms).toHaveURL(`${WEB}/terms`);
  await expect(terms.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
});

test('signing in means agreeing too', async ({ page }) => {
  await page.goto(`${WEB}/login`);
  await expect(page.getByText(/by continuing, you agree to our/i)).toBeVisible();

  const link = page.getByRole('link', { name: /terms of service/i });
  await expect(link).toHaveAttribute('href', '/terms');
  await expect(link).toHaveAttribute('target', '_blank');
});

test.describe('a guest opening a share link', () => {
  test.skip(!db, 'DATABASE_URL is not set');
  test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

  const suffix = randomUUID().slice(0, 8);
  const token = randomBytes(32).toString('base64url');
  let ownerId: string | undefined;
  let workspaceId: string | undefined;
  let boardId: string | undefined;

  test.beforeAll(async () => {
    const [owner] = await db!
      .insert(users)
      .values({ email: `e2e-legal-${suffix}@example.com`, name: 'E2E Legal' })
      .returning({ id: users.id });
    ownerId = owner!.id;

    const [workspace] = await db!
      .insert(workspaces)
      .values({ name: 'E2E Legal', slug: `e2e-legal-${suffix}` })
      .returning({ id: workspaces.id });
    workspaceId = workspace!.id;

    const [board] = await db!
      .insert(boards)
      .values({ workspaceId, ownerId, title: 'E2E Legal board' })
      .returning({ id: boards.id });
    boardId = board!.id;

    // Only the SHA-256 of the token is stored, exactly as the gateway mints one.
    await db!.insert(boardShareLinks).values({
      boardId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      role: 'editor',
      createdBy: ownerId,
      allowGuests: true,
    });
  });

  test.afterAll(async () => {
    // Children first: neither the board nor the link lets its creator go.
    if (boardId) {
      await db!.delete(boardShareLinks).where(eq(boardShareLinks.boardId, boardId));
      await db!.delete(boards).where(eq(boards.id, boardId));
    }
    if (workspaceId) await db!.delete(workspaces).where(eq(workspaces.id, workspaceId));
    if (ownerId) await db!.delete(users).where(eq(users.id, ownerId));
  });

  test('is told that joining means agreeing to the terms', async ({ page }) => {
    await page.goto(`${WEB}/invite/${token}`);
    await expect(page.getByRole('button', { name: 'Join board' })).toBeVisible();
    await expect(page.getByText(/by continuing, you agree to our/i)).toBeVisible();

    const link = page.getByRole('link', { name: /terms of service/i });
    await expect(link).toHaveAttribute('href', '/terms');
    await expect(link).toHaveAttribute('target', '_blank');
  });
});
