import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray, like, or } from 'drizzle-orm';
import {
  auditLog,
  createClient,
  createWorkspaceInvite,
  memberships,
  signInFailures,
  users,
  workspaceInvites,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Inviting people into a workspace by email, end to end: the gateway's rules,
 * the Members window in the real editor, and the /join page an invitation
 * opens, from a stranger with no account to a member on the workspace's board.
 *
 * Needs the local web app, editor, gateway and sync-server running. Every
 * address is on Resend's test inbox, so nothing real is emailed. The join page
 * is driven with invitations made straight in the database, because that is
 * the only place the token exists in the clear — the gateway mails it and
 * keeps only its hash.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=invites
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
const PREFIX = 'delivered+e2e-invites-';
const OWNER = `${PREFIX}owner-${RUN}@resend.dev`;
const INVITED = `${PREFIX}mia-${RUN}@resend.dev`;
const NEWCOMER = `${PREFIX}new-${RUN}@resend.dev`;
const PASSWORD = 'E2e!Invites-one1';

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

let workspaceId = '';
let workspaceName = '';
let owner: Page;

async function signUp(email: string, name: string) {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ email, password: PASSWORD, name, termsVersion: TERMS_VERSION }),
  });
  expect(response.status, `signup for ${name}`).toBe(201);
}

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 45_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20_000 });
  return page;
}

function invite(page: Page, body: unknown) {
  return page.request.post(`${GATEWAY}/workspaces/${workspaceId}/invites`, {
    headers: { Origin: EDITOR },
    data: body,
  });
}

/** An invitation made the way the gateway makes one, keeping the token it would have mailed. */
async function inviteWithToken(email: string): Promise<{ id: string; token: string }> {
  const [ownerRow] = await db!.select({ id: users.id }).from(users).where(eq(users.email, OWNER));
  const made = await createWorkspaceInvite(db!, {
    workspaceId,
    email,
    role: 'member',
    invitedBy: ownerRow!.id,
  });
  if (!made.ok) throw new Error(`could not invite ${email}: ${made.reason}`);
  return { id: made.invite.id, token: made.token };
}

async function openMembers(page: Page) {
  await page.getByTestId('menu-account').click();
  await page.getByTestId('menu-item-settings').click();
  await page.getByTestId('settings-tab-workspace').click();
  await page.getByTestId('workspace-members-open').click();
  const dialog = page.getByRole('dialog', { name: 'Members' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeAll(async ({ browser }) => {
  await cleanUp();
  await signUp(OWNER, 'Owner Olu');
  await signUp(INVITED, 'Mia Invited');
  owner = await signIn(browser, OWNER);

  const [row] = await db!
    .select({ id: workspaces.id, name: workspaces.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(and(eq(users.email, OWNER), eq(memberships.role, 'owner')));
  workspaceId = row!.id;
  workspaceName = row!.name;
});

test.afterAll(async () => {
  await cleanUp();
});

/** Everything this file makes, found by address so a failed run's leftovers go too. */
async function cleanUp() {
  if (!db) return;
  const people = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(like(users.email, `${PREFIX}%`));
  const ids = people.map((p) => p.id);
  if (ids.length > 0) {
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
    await db
      .delete(workspaceInvites)
      .where(
        or(inArray(workspaceInvites.invitedBy, ids), like(workspaceInvites.email, `${PREFIX}%`)),
      );
    await db.delete(auditLog).where(inArray(auditLog.actorId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  for (const email of [OWNER, INVITED, NEWCOMER, ...people.map((p) => p.email)]) {
    const digest = createHash('sha256').update(email).digest('hex');
    await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
  }
}

test('the gateway lets an owner with a confirmed address invite, and refuses what it should', async () => {
  // Inviting sends mail to an address somebody typed: not before confirming one's own.
  const unconfirmed = await invite(owner, { email: INVITED });
  expect(unconfirmed.status()).toBe(403);
  expect((await unconfirmed.json()).code).toBe('email-not-verified');

  await db!.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, OWNER));

  const sent = await invite(owner, { email: `  ${INVITED.toUpperCase()} `, role: 'admin' });
  expect(sent.status()).toBe(201);
  const { data } = await sent.json();
  expect(data.invite).toMatchObject({ email: INVITED, role: 'admin', expired: false });
  expect(data.emailSent).toBe(true);

  const again = await invite(owner, { email: INVITED });
  expect(again.status()).toBe(409);
  expect((await again.json()).code).toBe('already-invited');

  expect((await invite(owner, { email: OWNER })).status()).toBe(409);
  expect((await invite(owner, { email: 'not an address' })).status()).toBe(400);
  expect((await invite(owner, { email: NEWCOMER, role: 'owner' })).status()).toBe(400);

  // Another site cannot send invitations from a signed-in browser.
  const crossSite = await owner.request.post(`${GATEWAY}/workspaces/${workspaceId}/invites`, {
    headers: { Origin: 'https://evil.example' },
    data: { email: NEWCOMER },
  });
  expect(crossSite.status()).toBe(403);

  // Sending again is paced, and replaces the token.
  const resendUrl = `${GATEWAY}/workspaces/${workspaceId}/invites/${data.invite.id}/resend`;
  const [before] = await db!
    .select({ tokenHash: workspaceInvites.tokenHash })
    .from(workspaceInvites)
    .where(eq(workspaceInvites.id, data.invite.id));
  expect((await owner.request.post(resendUrl, { headers: { Origin: EDITOR } })).status()).toBe(409);
  await db!
    .update(workspaceInvites)
    .set({ lastSentAt: new Date(Date.now() - 2 * 60_000) })
    .where(eq(workspaceInvites.id, data.invite.id));
  const resent = await owner.request.post(resendUrl, { headers: { Origin: EDITOR } });
  expect(resent.status()).toBe(200);
  const [after] = await db!
    .select({ tokenHash: workspaceInvites.tokenHash, sendCount: workspaceInvites.sendCount })
    .from(workspaceInvites)
    .where(eq(workspaceInvites.id, data.invite.id));
  expect(after!.tokenHash).not.toBe(before!.tokenHash);
  expect(after!.sendCount).toBe(2);

  // The people list carries it for the owner.
  const people = await owner.request.get(`${GATEWAY}/workspaces/${workspaceId}/people`);
  expect((await people.json()).data.invites.map((i: { email: string }) => i.email)).toContain(
    INVITED,
  );
});

test('the Members window invites, lists and takes back invitations', async () => {
  // The address is confirmed now; a fresh load drops the notice saying it is not.
  await owner.reload();
  await expect(owner.locator('canvas').first()).toBeVisible({ timeout: 20_000 });

  const dialog = await openMembers(owner);
  await expect(dialog.getByText('Invited · 1')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText(INVITED)).toBeVisible();

  const other = `${PREFIX}sam-${RUN}@resend.dev`;
  await dialog.getByTestId('invite-email').fill(other);
  await dialog.getByTestId('invite-send').click();
  await expect(dialog.getByText(`Invitation sent to ${other}.`)).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText('Invited · 2')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId('invite-email')).toHaveValue('');

  // The same address again is pointed at Send again.
  await dialog.getByTestId('invite-email').fill(other);
  await dialog.getByTestId('invite-send').click();
  await expect(dialog.getByText(/is already invited\. Send it again/)).toBeVisible();

  await dialog.getByRole('button', { name: `Take back the invitation to ${other}` }).click();
  await expect(dialog.getByText(`Invitation to ${other} taken back.`)).toBeVisible();
  await expect(dialog.getByText('Invited · 1')).toBeVisible({ timeout: 15_000 });
});

test('a stranger signs up from the invitation and lands in the workspace', async ({ browser }) => {
  const { token } = await inviteWithToken(NEWCOMER);
  const page = await (await browser.newContext()).newPage();

  await page.goto(`${WEB}/join/${token}`);
  await expect(page.getByRole('heading', { name: `Join ${workspaceName}.` })).toBeVisible();
  await expect(page.getByText(`invited ${NEWCOMER} to join`)).toBeVisible();

  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.waitForURL(/\/signup\?/);
  await expect(page.getByPlaceholder('you@example.com')).toHaveValue(NEWCOMER);
  await page.getByPlaceholder('Your name').fill('Nia Newcomer');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Back on the invitation, signed in as the address it was sent to.
  await page.waitForURL(new RegExp(`/join/${token}$`), { timeout: 45_000 });
  await page.getByRole('button', { name: `Join ${workspaceName}` }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 45_000 });

  const [joined] = await db!
    .select({ role: memberships.role, verified: users.emailVerifiedAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(users.email, NEWCOMER), eq(memberships.workspaceId, workspaceId)));
  expect(joined?.role).toBe('member');
  // Following the link proved the inbox, so the new account is confirmed.
  expect(joined?.verified).not.toBeNull();

  // The same link again says they are in, and opens the workspace.
  await page.goto(`${WEB}/join/${token}`);
  await expect(page.getByRole('heading', { name: `You’re in ${workspaceName}.` })).toBeVisible();
});

test('the owner sees the new member arrive without reloading', async () => {
  const dialog = owner.getByRole('dialog', { name: 'Members' });
  await expect(dialog.getByText('Members · 2')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText('Nia Newcomer')).toBeVisible();
});

test('an invitation refuses the wrong account, and says when it was taken back', async ({
  browser,
}) => {
  const { id, token } = await inviteWithToken(`${PREFIX}zed-${RUN}@resend.dev`);

  // The owner is signed in as somebody else entirely.
  await owner.goto(`${WEB}/join/${token}`);
  await expect(
    owner.getByRole('heading', { name: 'This invitation isn’t for you.' }),
  ).toBeVisible();
  await expect(owner.getByRole('button', { name: 'Switch account' })).toBeVisible();

  const revoked = await owner.request.delete(`${GATEWAY}/workspaces/${workspaceId}/invites/${id}`, {
    headers: { Origin: EDITOR },
  });
  expect(revoked.status()).toBe(204);

  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(`${WEB}/join/${token}`);
  await expect(
    stranger.getByRole('heading', { name: 'This invitation was taken back.' }),
  ).toBeVisible();

  await stranger.goto(`${WEB}/join/not-a-real-token`);
  await expect(
    stranger.getByRole('heading', { name: 'This invitation isn’t valid.' }),
  ).toBeVisible();
});
