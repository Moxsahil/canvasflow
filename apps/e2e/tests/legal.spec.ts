import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  boardMembers,
  boardShareLinks,
  boards,
  createClient,
  users,
  workspaces,
} from '@canvasflow/db';

/**
 * The Terms of Service, every place that says continuing means agreeing to
 * them, and the record each of those leaves, as someone who has never signed
 * in meets them.
 *
 * The terms have to open without an account — they are read before one exists
 * — and each way into CanvasFlow has to point at them and then record the
 * agreement: signup, sign-in (whose Google and GitHub buttons create an account
 * for anybody new) and a share link's guest form.
 *
 * Needs the local web app and gateway running. The cases that read or write
 * accounts also need the development database in DATABASE_URL — read from the
 * repository's .env when it is not already set. They make a throwaway account,
 * guest, board and share link, the same shapes the app writes, and remove them
 * afterwards. The signup's verification mail goes to Resend's test inbox.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=legal
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the database cases say which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EDITOR = 'http://localhost:3002';
const PASSWORD = 'E2e!Legal-pass1';

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

/**
 * The version in force, as the terms page itself states it: its "Last updated"
 * date. Asserting the record against this is what proves the date a reader
 * sees and the version their account records are the same thing.
 */
async function termsVersionOnThePage(page: Page): Promise<string> {
  await page.goto(`${WEB}/terms`);
  const version = await page.locator('time').getAttribute('datetime');
  expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  return version!;
}

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

test('the Google and GitHub buttons tell the gateway which terms the page showed', async ({
  page,
}) => {
  const version = await termsVersionOnThePage(page);
  // Stopped at the gateway's door: going on to the provider needs a real
  // account there, and the gateway's side is the next case.
  await page.route('**/auth/oauth/**', (route) => route.abort());

  for (const path of ['/signup', '/login']) {
    for (const provider of ['Google', 'GitHub']) {
      await page.goto(`${WEB}${path}`);
      const [start] = await Promise.all([
        page.waitForRequest('**/auth/oauth/**'),
        page.getByRole('button', { name: `Continue with ${provider}` }).click(),
      ]);
      expect(new URL(start.url()).searchParams.get('terms'), `${path}, ${provider}`).toBe(version);
    }
  }
});

test('the gateway keeps that version for the trip to the provider, and nothing else', async ({
  page,
}) => {
  const version = await termsVersionOnThePage(page);
  const start = (terms: string | null) =>
    fetch(`${GATEWAY}/auth/oauth/google?next=%2Fopen${terms ? `&terms=${terms}` : ''}`, {
      redirect: 'manual',
    });
  const termsCookie = (response: Response) =>
    response.headers.getSetCookie().find((cookie) => cookie.startsWith('cf.oauth.terms='));

  const kept = await start(version);
  expect(kept.status, 'handed on to Google').toBe(302);
  expect(termsCookie(kept)).toMatch(new RegExp(`^cf\\.oauth\\.terms=${version};.*HttpOnly`, 'i'));

  // Anything but the version in force is not kept — and any leftover is cleared.
  for (const other of [null, '2020-01-01']) {
    expect(termsCookie(await start(other)), String(other)).toMatch(/^cf\.oauth\.terms=;/);
  }
});

test.describe('an account made through the signup form', () => {
  test.skip(!db, 'DATABASE_URL is not set');
  test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

  const email = `delivered+e2e-legal-${randomUUID().slice(0, 8)}@resend.dev`;

  test.afterAll(async () => {
    const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!row) return;
    // Sessions and verification links go with the account; the audit rows its
    // sign-in wrote would only lose their actor.
    await db!.delete(auditLog).where(eq(auditLog.actorId, row.id));
    await db!.delete(users).where(eq(users.id, row.id));
  });

  test('records agreement to the terms the page showed', async ({ page }) => {
    const version = await termsVersionOnThePage(page);
    // Stopped short of /open, which would go on to make a workspace and board.
    await page.route('**/open', (route) => route.abort());

    await page.goto(`${WEB}/signup`);
    await page.getByPlaceholder('Your name').fill('E2E Legal');
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);

    const [signedUp] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith('/auth/signup')),
      page.getByRole('button', { name: 'Create account' }).click(),
    ]);
    expect(signedUp.status()).toBe(201);

    const [row] = await db!
      .select({ termsVersion: users.termsVersion, termsAcceptedAt: users.termsAcceptedAt })
      .from(users)
      .where(eq(users.email, email));
    expect(row?.termsVersion).toBe(version);
    expect(row?.termsAcceptedAt).toBeInstanceOf(Date);
  });
});

test.describe('a guest opening a share link', () => {
  test.skip(!db, 'DATABASE_URL is not set');
  test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

  const suffix = randomUUID().slice(0, 8);
  const token = randomBytes(32).toString('base64url');
  let ownerId: string | undefined;
  let workspaceId: string | undefined;
  let boardId: string | undefined;

  /** Guests who have joined the throwaway board, with what their rows record. */
  const guestsOnTheBoard = () =>
    db!
      .select({
        id: users.id,
        termsVersion: users.termsVersion,
        termsAcceptedAt: users.termsAcceptedAt,
      })
      .from(boardMembers)
      .innerJoin(users, eq(users.id, boardMembers.userId))
      .where(and(eq(boardMembers.boardId, boardId!), eq(users.isGuest, true)));

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
    // Children first: neither the board nor the link lets its creator go. The
    // guests' memberships go with the board; their rows have to be named.
    if (boardId) {
      const guestIds = (await guestsOnTheBoard()).map((guest) => guest.id);
      await db!.delete(boardShareLinks).where(eq(boardShareLinks.boardId, boardId));
      await db!.delete(boards).where(eq(boards.id, boardId));
      if (guestIds.length > 0) await db!.delete(users).where(inArray(users.id, guestIds));
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

  test('records agreement when they join', async ({ page }) => {
    const version = await termsVersionOnThePage(page);
    // Stopped at the editor: the join is written before it redirects there.
    await page.route(`${EDITOR}/**`, (route) => route.abort());

    await page.goto(`${WEB}/invite/${token}`);
    await page.getByLabel('Your name').fill('E2E Guest');
    await page.getByRole('button', { name: 'Join board' }).click();

    await expect.poll(async () => (await guestsOnTheBoard()).length).toBe(1);
    const [guest] = await guestsOnTheBoard();
    expect(guest?.termsVersion).toBe(version);
    expect(guest?.termsAcceptedAt).toBeInstanceOf(Date);
  });
});
