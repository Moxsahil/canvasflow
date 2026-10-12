import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray, like } from 'drizzle-orm';
import {
  auditLog,
  boardMembers,
  boards,
  createClient,
  memberships,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Who is in a workspace, end to end: changing people between member and admin,
 * removing them, leaving, and handing the ownership over — which waits for the
 * person offered it to accept, and keeps the owner from leaving until they do.
 *
 * Needs the local web app, editor, gateway and sync-server running. Four
 * throwaway people on Resend's test inbox, put into one workspace straight
 * through the database, and removed afterwards.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=members
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EDITOR = 'http://localhost:3002';
const RUN = randomUUID().slice(0, 8);
const PREFIX = 'delivered+e2e-members-';
const PASSWORD = 'E2e!Members-one1';
const PEOPLE = {
  owner: { email: `${PREFIX}owner-${RUN}@resend.dev`, name: 'Olu Owner' },
  admin: { email: `${PREFIX}admin-${RUN}@resend.dev`, name: 'Ada Admin' },
  member: { email: `${PREFIX}member-${RUN}@resend.dev`, name: 'Mia Member' },
  heir: { email: `${PREFIX}heir-${RUN}@resend.dev`, name: 'Hal Heir' },
};
type Who = keyof typeof PEOPLE;

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

let workspaceId = '';
let workspaceName = '';
/** A board the member owns in the owner's workspace, to see it pass on. */
let memberBoardId = '';
const ids = {} as Record<Who, string>;
const pages = {} as Record<Who, Page>;

async function signIn(browser: Browser, who: Who): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('you@example.com').fill(PEOPLE[who].email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 45_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  return page;
}

function call(who: Who, method: 'post' | 'patch' | 'delete', path: string, data?: unknown) {
  return pages[who].request[method](`${GATEWAY}/workspaces/${workspaceId}${path}`, {
    headers: { Origin: EDITOR },
    ...(data === undefined ? {} : { data }),
  });
}

async function roleOf(who: Who) {
  const [row] = await db!
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, ids[who])));
  return row?.role ?? null;
}

async function openWorkspaceSettings(page: Page) {
  // Settings may still be open from the step before; the tab is all it needs.
  if (!(await page.getByTestId('settings-dialog').isVisible())) {
    await page.getByTestId('menu-account').click();
    await page.getByTestId('menu-item-settings').click();
  }
  await page.getByTestId('settings-tab-workspace').click();
  return page.getByTestId('settings-dialog');
}

async function cleanUp() {
  if (!db) return;
  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(like(users.email, `${PREFIX}%`));
  const found = people.map((p) => p.id);
  if (found.length > 0) {
    const theirs = await db
      .select({ workspaceId: memberships.workspaceId })
      .from(memberships)
      .where(inArray(memberships.userId, found));
    const owned = await db
      .select({ workspaceId: boards.workspaceId })
      .from(boards)
      .where(inArray(boards.ownerId, found));
    const all = [...theirs, ...owned].map((row) => row.workspaceId);
    if (all.length > 0) await db.delete(workspaces).where(inArray(workspaces.id, all));
    await db.delete(auditLog).where(inArray(auditLog.actorId, found));
    await db.delete(users).where(inArray(users.id, found));
  }
  for (const { email } of [...Object.values(PEOPLE), ...people]) {
    const digest = createHash('sha256').update(email).digest('hex');
    await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
  }
}

test.beforeAll(async ({ browser }) => {
  // Four signups and four sign-ins against a remote development database.
  test.setTimeout(180_000);
  await cleanUp();
  for (const { email, name } of Object.values(PEOPLE)) {
    const response = await fetch(`${GATEWAY}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD, name, termsVersion: TERMS_VERSION }),
    });
    expect(response.status, `signup for ${name}`).toBe(201);
  }
  // Confirmed, so the notice asking them to confirm stays out of the way.
  await db!
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(like(users.email, `${PREFIX}%`));
  for (const who of Object.keys(PEOPLE) as Who[]) {
    const [row] = await db!
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, PEOPLE[who].email));
    ids[who] = row!.id;
  }

  pages.owner = await signIn(browser, 'owner');
  const [workspace] = await db!
    .select({ id: workspaces.id, name: workspaces.name })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(memberships.userId, ids.owner), eq(memberships.role, 'owner')));
  workspaceId = workspace!.id;
  workspaceName = workspace!.name;

  await db!.insert(memberships).values([
    { workspaceId, userId: ids.admin, role: 'admin' },
    { workspaceId, userId: ids.member, role: 'member' },
    { workspaceId, userId: ids.heir, role: 'member' },
  ]);
  const [board] = await db!
    .insert(boards)
    .values({ workspaceId, ownerId: ids.member, title: 'Mia’s plan', updatedAt: new Date(0) })
    .returning({ id: boards.id });
  memberBoardId = board!.id;

  pages.admin = await signIn(browser, 'admin');
  pages.member = await signIn(browser, 'member');
  pages.heir = await signIn(browser, 'heir');
});

test.afterAll(async () => {
  await cleanUp();
});

test('the gateway lets owners and admins manage members and admins, and nobody the owner', async () => {
  expect((await call('member', 'patch', `/members/${ids.heir}`, { role: 'admin' })).status()).toBe(
    403,
  );
  expect((await call('admin', 'patch', `/members/${ids.owner}`, { role: 'member' })).status()).toBe(
    403,
  );
  expect((await call('admin', 'patch', `/members/${ids.admin}`, { role: 'member' })).status()).toBe(
    400,
  );
  expect((await call('admin', 'patch', `/members/${ids.heir}`, { role: 'owner' })).status()).toBe(
    400,
  );
  expect((await call('owner', 'delete', `/members/${ids.owner}`)).status()).toBe(400);

  expect((await call('admin', 'patch', `/members/${ids.heir}`, { role: 'admin' })).status()).toBe(
    204,
  );
  expect(await roleOf('heir')).toBe('admin');
  // An admin can change another admin back.
  expect((await call('admin', 'patch', `/members/${ids.heir}`, { role: 'member' })).status()).toBe(
    204,
  );
  expect(await roleOf('heir')).toBe('member');

  // The owner cannot leave until somebody has accepted the workspace.
  const leaving = await call('owner', 'post', '/leave');
  expect(leaving.status()).toBe(409);
  expect((await leaving.json()).code).toBe('owner-must-hand-over');

  // Another site cannot do any of it from a signed-in browser.
  const crossSite = await pages.admin.request.patch(
    `${GATEWAY}/workspaces/${workspaceId}/members/${ids.heir}`,
    { headers: { Origin: 'https://evil.example' }, data: { role: 'admin' } },
  );
  expect(crossSite.status()).toBe(403);
});

test('an admin sets what a guest may do on the boards, and takes them off', async () => {
  // A guest on two of the workspace's boards, one to edit and one to view.
  const [guest] = await db!
    .insert(users)
    .values({ email: `${PREFIX}guest-${RUN}@resend.dev`, name: 'Prachi Guest', isGuest: true })
    .returning({ id: users.id });
  const guestId = guest!.id;
  const boardIds = (
    await db!.select({ id: boards.id }).from(boards).where(eq(boards.workspaceId, workspaceId))
  ).map((board) => board.id);
  expect(boardIds.length).toBeGreaterThanOrEqual(2);
  await db!.insert(boardMembers).values([
    { boardId: boardIds[0]!, userId: guestId, role: 'editor', grantedBy: ids.owner },
    { boardId: boardIds[1]!, userId: guestId, role: 'viewer', grantedBy: ids.owner },
  ]);
  const grants = async () =>
    db!
      .select({ role: boardMembers.role, status: boardMembers.status })
      .from(boardMembers)
      .where(eq(boardMembers.userId, guestId));

  // A member may not; the gateway says so.
  expect((await call('member', 'patch', `/guests/${guestId}`, { role: 'viewer' })).status()).toBe(
    403,
  );
  // Somebody in the workspace is managed as a member, never as a guest.
  expect((await call('admin', 'patch', `/guests/${ids.member}`, { role: 'viewer' })).status()).toBe(
    404,
  );

  const settings = await openWorkspaceSettings(pages.admin);
  await settings.getByTestId('workspace-members-open').click();
  const dialog = pages.admin.getByRole('dialog', { name: 'Members' });
  const menu = dialog.getByTestId(`guest-menu-${guestId}`);
  await expect(menu).toContainText('Mixed access', { timeout: 15_000 });

  await menu.click();
  await pages.admin.getByRole('menuitemradio', { name: 'Can view' }).click();
  await expect(menu).toContainText('Can view', { timeout: 15_000 });
  expect((await grants()).map((g) => g.role)).toEqual(['viewer', 'viewer']);

  await menu.click();
  await pages.admin.getByRole('menuitem', { name: 'Remove from boards' }).click();
  await pages.admin.getByTestId('confirm-remove-guest').click();
  await expect(dialog.getByText('Prachi Guest was removed from the boards.')).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog.getByTestId(`workspace-guest-${guestId}`)).toHaveCount(0, {
    timeout: 15_000,
  });
  expect((await grants()).map((g) => g.status)).toEqual(['revoked', 'revoked']);

  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
});

test('an admin removes a member from the Members window, and they lose the board at once', async () => {
  // The member is on their own board in the workspace when it happens.
  await pages.member.goto(`${EDITOR}/boards/${memberBoardId}`);
  await expect(pages.member.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  await pages.member.waitForTimeout(1500);

  const settings = await openWorkspaceSettings(pages.admin);
  await settings.getByTestId('workspace-members-open').click();
  const dialog = pages.admin.getByRole('dialog', { name: 'Members' });
  await expect(dialog.getByTestId(`member-menu-${ids.member}`)).toBeVisible({ timeout: 15_000 });

  await dialog.getByTestId(`member-menu-${ids.member}`).click();
  await pages.admin.getByRole('menuitem', { name: 'Remove from workspace' }).click();
  const confirm = pages.admin.getByRole('dialog', { name: `Remove ${PEOPLE.member.name}?` });
  await expect(confirm).toContainText(`pass to ${PEOPLE.owner.name}`);
  await confirm.getByTestId('confirm-remove').click();

  await expect(
    dialog.getByText(
      `${PEOPLE.member.name} was removed. Their 1 board passed to ${PEOPLE.owner.name}.`,
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId(`workspace-member-${ids.member}`)).toHaveCount(0, {
    timeout: 15_000,
  });

  // Off the board within moments, without waiting for the sweep.
  await expect(pages.member.getByTestId('access-revoked-dialog')).toBeVisible({ timeout: 4_000 });

  expect(await roleOf('member')).toBeNull();
  const [board] = await db!
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, memberBoardId));
  expect(board?.ownerId).toBe(ids.owner);
  const [grant] = await db!
    .select({ status: boardMembers.status })
    .from(boardMembers)
    .where(and(eq(boardMembers.boardId, memberBoardId), eq(boardMembers.userId, ids.member)));
  expect(grant?.status).toBe('revoked');

  await pages.admin.keyboard.press('Escape');
});

test('the owner offers the workspace, cannot leave until it is accepted, then can', async () => {
  const settings = await openWorkspaceSettings(pages.owner);
  await settings.getByTestId('workspace-hand-over').click();
  const handOver = pages.owner.getByRole('dialog', { name: 'Hand over the workspace' });
  await handOver.getByTestId(`hand-over-${ids.heir}`).click();
  await handOver.getByTestId('hand-over-offer').click();

  await expect(
    settings.getByText(`Waiting for ${PEOPLE.heir.name} to accept the ownership.`),
  ).toBeVisible({ timeout: 15_000 });
  expect((await call('owner', 'post', '/leave')).status()).toBe(409);
  expect(await roleOf('owner')).toBe('owner');

  // The heir answers in their own Settings.
  const theirs = await openWorkspaceSettings(pages.heir);
  await expect(theirs.getByText('Become the owner?')).toBeVisible({ timeout: 15_000 });
  await theirs.getByTestId('ownership-accept').click();
  await expect(theirs.getByText('Become the owner?')).toBeHidden({ timeout: 15_000 });

  expect(await roleOf('heir')).toBe('owner');
  expect(await roleOf('owner')).toBe('admin');
  const [workspace] = await db!
    .select({ offeredTo: workspaces.ownershipOfferedTo })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  expect(workspace?.offeredTo).toBeNull();

  // The former owner's page follows without a reload: Leave is open to them now.
  await expect(settings.getByTestId('workspace-leave')).toBeEnabled({ timeout: 15_000 });
});

test('someone leaves from Settings and lands on a board of their own', async () => {
  const settings = pages.owner.getByTestId('settings-dialog');
  await settings.getByTestId('workspace-leave').click();
  const confirm = pages.owner.getByRole('dialog', { name: `Leave ${workspaceName}?` });
  await expect(confirm).toContainText(`pass to ${PEOPLE.heir.name}`);
  const before = pages.owner.url();
  await confirm.getByTestId('confirm-leave').click();

  // A different board: the one they were on belongs to the workspace they left.
  await pages.owner.waitForURL(
    (url) => url.href.split('#')[0] !== before.split('#')[0] && url.pathname.startsWith('/boards/'),
    { timeout: 45_000 },
  );
  await expect(pages.owner.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  expect(await roleOf('owner')).toBeNull();

  // The board the member owned passed to the owner, and on again to the new one.
  const [board] = await db!
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.id, memberBoardId));
  expect(board?.ownerId).toBe(ids.heir);
});
