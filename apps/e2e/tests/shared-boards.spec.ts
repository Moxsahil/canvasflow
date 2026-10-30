import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray, like } from 'drizzle-orm';
import {
  auditLog,
  boardMembers,
  boardShareLinks,
  boards,
  createClient,
  createShareLink,
  memberships,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Two things about boards shared by link, end to end:
 *
 * - An account let onto somebody else's board gets a sidebar that says so —
 *   "Shared with you", listing what has been shared — instead of one stuck
 *   asking for a workspace it may not see.
 * - A guest without an account, once removed, is not let back in by the same
 *   browser, and the owner is told the link could still let them in from
 *   another one, and offered a new link.
 *
 * Needs the local web app, editor, gateway and sync-server running. Throwaway
 * people on Resend's test inbox, removed afterwards; guests are found by the
 * board they were let onto.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=shared
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const RUN = randomUUID().slice(0, 8);
const PREFIX = 'delivered+e2e-shared-';
const PASSWORD = 'E2e!Shared-one1';
const OWNER = { email: `${PREFIX}owner-${RUN}@resend.dev`, name: 'Olu Owner' };
const FRIEND = { email: `${PREFIX}friend-${RUN}@resend.dev`, name: 'Fay Friend' };
const ADMIN = { email: `${PREFIX}admin-${RUN}@resend.dev`, name: 'Ada Admin' };
const MEMBER = { email: `${PREFIX}member-${RUN}@resend.dev`, name: 'Mo Member' };

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

let owner: Page;
let boardId = '';
let boardTitle = '';
let token = '';
let workspaceId = '';
const ids: Record<string, string> = {};

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 45_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  return page;
}

async function cleanUp() {
  if (!db) return;
  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(like(users.email, `${PREFIX}%`));
  const ids = people.map((p) => p.id);
  if (ids.length > 0) {
    const owned = await db
      .select({ boardId: boards.id })
      .from(boards)
      .where(inArray(boards.ownerId, ids));
    // The guests let onto these boards have no address of ours to find them by.
    if (owned.length > 0) {
      const guests = await db
        .select({ userId: boardMembers.userId })
        .from(boardMembers)
        .innerJoin(users, eq(users.id, boardMembers.userId))
        .where(
          and(
            inArray(
              boardMembers.boardId,
              owned.map((b) => b.boardId),
            ),
            eq(users.isGuest, true),
          ),
        );
      const theirs = await db
        .select({ workspaceId: memberships.workspaceId })
        .from(memberships)
        .where(inArray(memberships.userId, ids));
      await db.delete(workspaces).where(
        inArray(
          workspaces.id,
          theirs.map((m) => m.workspaceId),
        ),
      );
      if (guests.length > 0) {
        await db.delete(users).where(
          inArray(
            users.id,
            guests.map((g) => g.userId),
          ),
        );
      }
    } else {
      const theirs = await db
        .select({ workspaceId: memberships.workspaceId })
        .from(memberships)
        .where(inArray(memberships.userId, ids));
      if (theirs.length > 0) {
        await db.delete(workspaces).where(
          inArray(
            workspaces.id,
            theirs.map((m) => m.workspaceId),
          ),
        );
      }
    }
    await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  for (const { email } of [OWNER, FRIEND, ADMIN, MEMBER, ...people]) {
    const digest = createHash('sha256').update(email).digest('hex');
    await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  await cleanUp();
  for (const { email, name } of [OWNER, FRIEND, ADMIN, MEMBER]) {
    const response = await fetch(`${GATEWAY}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD, name, termsVersion: TERMS_VERSION }),
    });
    expect(response.status, `signup for ${name}`).toBe(201);
  }
  await db!
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(like(users.email, `${PREFIX}%`));

  owner = await signIn(browser, OWNER.email);
  const [ownerRow] = await db!
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, OWNER.email));
  const [board] = await db!
    .select({ id: boards.id, title: boards.title })
    .from(boards)
    .where(eq(boards.ownerId, ownerRow!.id));
  boardId = board!.id;
  boardTitle = 'Olu’s launch plan';
  await db!.update(boards).set({ title: boardTitle }).where(eq(boards.id, boardId));
  // The link the owner's Share window would start, kept in the clear for the test.
  const made = await createShareLink(db!, { boardId, createdBy: ownerRow!.id });
  token = made.token;

  // An admin and a member of the owner's workspace, as an email invitation
  // would leave them.
  const [workspace] = await db!
    .select({ id: memberships.workspaceId })
    .from(memberships)
    .where(eq(memberships.userId, ownerRow!.id));
  workspaceId = workspace!.id;
  for (const [person, role] of [
    [ADMIN, 'admin'],
    [MEMBER, 'member'],
  ] as const) {
    const [row] = await db!
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, person.email));
    ids[person.email] = row!.id;
    await db!.insert(memberships).values({ workspaceId, userId: row!.id, role });
  }
});

test.afterAll(async () => {
  await cleanUp();
});

test('an account let onto somebody else’s board sees it under Shared with you', async ({
  browser,
}) => {
  const friend = await signIn(browser, FRIEND.email);
  await friend.goto(`${WEB}/invite/${token}`);
  await friend.getByRole('button', { name: 'Open board' }).click();
  await friend.waitForURL(new RegExp(`/boards/${boardId}`), { timeout: 45_000 });
  await expect(friend.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

  // The header names where the board came from, not a workspace stuck loading.
  const header = friend.getByTestId('workspace-switcher');
  await expect(header).toContainText('Shared with you', { timeout: 15_000 });
  await expect(friend.getByText('Couldn’t load the boards. Try again')).toHaveCount(0);
  const shared = friend.getByTestId('sidebar-shared-boards');
  await expect(shared.getByTestId(`sidebar-shared-board-${boardId}`)).toContainText(boardTitle);
  await expect(shared).toContainText(`${OWNER.name} · Can edit`);

  // Settings → Workspace says whose board this is, and that its workspace is
  // not theirs to run — not their own workspace's controls under it.
  await friend.getByTestId('menu-account').click();
  await friend.getByTestId('menu-item-settings').click();
  await friend.getByTestId('settings-tab-workspace').click();
  const settings = friend.getByTestId('settings-dialog');
  await expect(settings.getByText(`Shared with you from ${OWNER.name}'s workspace`)).toBeVisible({
    timeout: 15_000,
  });
  await expect(settings.getByText('Can edit', { exact: true })).toBeVisible();
  await expect(settings.getByTestId('workspace-members-open')).toHaveCount(0);
  // Their own workspace is one click away, and the page follows to it.
  await settings.getByTestId('workspace-show-own').click();
  await expect(settings.getByLabel('Workspace name')).toHaveValue(`${FRIEND.name}'s workspace`, {
    timeout: 15_000,
  });
  await friend.keyboard.press('Escape');

  // Their own workspace is one step away, and the shared list stays in the menu.
  // The header is in the open sidebar only, not the rail it starts folded to.
  const expand = friend.getByRole('button', { name: 'Expand sidebar' });
  if (await expand.isVisible()) await expand.click();
  // Opening it from Settings listed it in the sidebar too.
  await expect(header).toContainText(`${FRIEND.name}'s workspace`);
  await header.click();
  await expect(friend.getByRole('button', { name: /^Shared with you\s*1 board/ })).toBeVisible();
});

test('a removed guest is not let back in by the same browser, and the owner is offered a new link', async ({
  browser,
}) => {
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`${WEB}/invite/${token}`);
  await guest.getByLabel('Your name').fill('Gus Guest');
  await guest.getByRole('button', { name: 'Join board' }).click();
  await guest.waitForURL(new RegExp(`/boards/${boardId}`), { timeout: 45_000 });
  await expect(guest.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

  const [guestRow] = await db!
    .select({ id: users.id })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(and(eq(boardMembers.boardId, boardId), eq(users.name, 'Gus Guest')));
  const guestId = guestRow!.id;

  // The owner removes them from the Share window.
  await owner.getByRole('button', { name: /manage links|Share this board/ }).click();
  const share = owner.getByTestId('share-dialog');
  await share.getByTestId(`share-role-menu-${guestId}`).click({ timeout: 15_000 });
  await owner.getByRole('menuitem', { name: 'Remove from board' }).click();

  const warning = share.getByTestId('share-guest-may-return');
  await expect(warning).toContainText('Gus Guest joined without an account', { timeout: 15_000 });

  // Back in the same browser, the link says they were removed.
  await guest.goto(`${WEB}/invite/${token}`);
  await expect(
    guest.getByRole('heading', { name: 'You were removed from this board' }),
  ).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Join board' })).toHaveCount(0);

  // A new link: the old one stops working at once.
  const [before] = await db!
    .select({ id: boardShareLinks.id })
    .from(boardShareLinks)
    .where(eq(boardShareLinks.boardId, boardId));
  await warning.getByTestId('share-reset-link').click();
  await expect(warning).toHaveCount(0, { timeout: 15_000 });
  const [old] = await db!
    .select({ revokedAt: boardShareLinks.revokedAt })
    .from(boardShareLinks)
    .where(eq(boardShareLinks.id, before!.id));
  expect(old?.revokedAt).not.toBeNull();

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`${WEB}/invite/${token}`);
  await expect(stranger.getByRole('heading', { name: 'This link was turned off' })).toBeVisible();
});

test('only the owner and the workspace’s admins run sharing; others get no link', async ({
  browser,
}) => {
  const shareLinks = (page: Page) =>
    page.request.post(`${WEB}/api/boards/${boardId}/share-links`, {
      headers: { Origin: 'http://localhost:3002' },
      data: { role: 'editor' },
    });

  // A member of the workspace: no link to pass on, and the server agrees.
  const member = await signIn(browser, MEMBER.email);
  await member.goto(`http://localhost:3002/boards/${boardId}`);
  await expect(member.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await member.getByRole('button', { name: /manage links|Share this board/ }).click();
  const theirs = member.getByTestId('share-dialog');
  await expect(theirs).toContainText(
    `Only ${OWNER.name} and the workspace’s admins can invite people`,
    { timeout: 15_000 },
  );
  await expect(theirs.getByLabel('Board link')).toHaveCount(0);
  await expect(theirs.getByTestId('share-start')).toHaveCount(0);
  // Nor anywhere else: no Copy board link on the board card.
  await member.getByTestId('menu-board-more').click();
  await expect(member.getByTestId('menu-item-copyLink')).toHaveCount(0);
  await member.keyboard.press('Escape');
  expect((await shareLinks(member)).status()).toBe(403);
  expect((await member.request.get(`${WEB}/api/boards/${boardId}/members`)).status()).toBe(403);

  // An admin runs the board's sharing as its owner does, and sees the
  // workspace's people on it, however they joined.
  const admin = await signIn(browser, ADMIN.email);
  await admin.goto(`http://localhost:3002/boards/${boardId}`);
  await expect(admin.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await admin.getByRole('button', { name: /manage links|Share this board/ }).click();
  const share = admin.getByTestId('share-dialog');
  await expect(share.getByTestId(`share-workspace-${ids[MEMBER.email]}`)).toContainText(
    'Workspace member',
    { timeout: 15_000 },
  );
  await expect(share.getByTestId(`share-workspace-${ids[ADMIN.email]}`)).toContainText(
    'Workspace admin',
  );
  expect((await shareLinks(admin)).status()).toBe(201);
  await admin.keyboard.press('Escape');
  await admin.getByTestId('menu-board-more').click();
  await expect(admin.getByTestId('menu-item-copyLink')).toBeAttached();
});
