import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray, isNotNull, like, sql } from 'drizzle-orm';
import {
  auditLog,
  boardMembers,
  boards,
  createClient,
  createShareLink,
  createWorkspaceInvite,
  memberships,
  notificationDeliveries,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * The emails about joins and access changes, end to end:
 *
 * - Somebody new coming in through a share link emails whoever made the link,
 *   once per board in a while; opening the link again sends nothing.
 * - An accepted workspace invitation emails whoever sent it.
 * - A change to somebody's role on a board, or being let back on, emails
 *   them, a run of changes once; being removed sends nothing.
 * - A workspace role change, and a guest's access changed from the member
 *   list, email them.
 * - A switch turned off holds the email back.
 * - The gateway's internal route takes only our own services.
 *
 * Needs the local web app, editor, gateway and sync-server running, and the
 * gateway's RESEND_API_KEY: everyone is on Resend's test inbox. Throwaway
 * people, removed afterwards; guests are found by the board they joined.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=join-emails
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

/** The gateway's own secret, which signs internal calls. Read, never set into this process. */
function gatewaySecret(): string | null {
  try {
    const file = readFileSync(
      new URL('../../../services/api-gateway/.env', import.meta.url),
      'utf8',
    );
    return (
      /^AUTH_SECRET=(.+)$/m
        .exec(file)?.[1]
        ?.trim()
        .replace(/^["']|["']$/g, '') ?? null
    );
  } catch {
    return null;
  }
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const EDITOR = 'http://localhost:3002';
const RUN = randomUUID().slice(0, 8);
const PREFIX = 'delivered+e2e-joinmail-';
const PASSWORD = 'E2e!Joinmail-one1';
const OWNER = { email: `${PREFIX}owner-${RUN}@resend.dev`, name: 'Olu Owner' };
const FRIEND = { email: `${PREFIX}friend-${RUN}@resend.dev`, name: 'Fay Friend' };
const NEWBIE = { email: `${PREFIX}newbie-${RUN}@resend.dev`, name: 'Nia Newbie' };
const GUEST_NAME = `Gus ${RUN}`;

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;
const secret = gatewaySecret();

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(!secret, "the gateway's AUTH_SECRET is not readable");
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

let owner: Page;
let boardId = '';
let workspaceId = '';
let linkToken = '';
let inviteToken = '';
const ids: Record<string, string> = {};

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

/** One person's notices of one kind, oldest first, as emailed (true) or held (false). */
async function notices(email: string, kind: string): Promise<boolean[]> {
  const rows = await db!
    .select({ emailedAt: notificationDeliveries.emailedAt })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, ids[email]!),
        eq(notificationDeliveries.kind, kind),
      ),
    )
    .orderBy(notificationDeliveries.createdAt);
  return rows.map((row) => row.emailedAt !== null);
}

/** Wait for a notice that is handled behind the gateway's answer to settle. */
async function expectNotices(email: string, kind: string, expected: boolean[]) {
  await expect.poll(() => notices(email, kind), { timeout: 15_000 }).toEqual(expected);
}

/** Move someone's email of this kind out of the quiet window, as time passing would. */
async function forgetRecentEmails(email: string, kind: string) {
  await db!
    .update(notificationDeliveries)
    .set({ emailedAt: new Date(Date.now() - 60 * 60_000) })
    .where(
      and(
        eq(notificationDeliveries.recipientId, ids[email]!),
        eq(notificationDeliveries.kind, kind),
        // Only those that went: one held back stays held back.
        isNotNull(notificationDeliveries.emailedAt),
      ),
    );
}

/** Flip one of someone's email switches, as Settings would. */
async function setSwitch(email: string, kind: string, on: boolean) {
  await db!
    .update(users)
    .set({
      preferences: sql`jsonb_set(${users.preferences}, '{notifications}', coalesce(${users.preferences} -> 'notifications', '{}'::jsonb) || ${JSON.stringify({ [kind]: on })}::jsonb)`,
    })
    .where(eq(users.id, ids[email]!));
}

/** The owner changing someone's role on the board, as the Share window does. */
function setBoardRole(userId: string, role: 'editor' | 'viewer') {
  return owner.request.patch(`${WEB}/api/boards/${boardId}/members/${userId}`, {
    data: { role },
  });
}

async function cleanUp() {
  if (!db) return;
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, `${PREFIX}%`));
  const peopleIds = people.map((p) => p.id);
  if (peopleIds.length === 0) return;
  const owned = await db
    .select({ boardId: boards.id })
    .from(boards)
    .where(inArray(boards.ownerId, peopleIds));
  const guests =
    owned.length === 0
      ? []
      : await db
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
    .where(inArray(memberships.userId, peopleIds));
  if (theirs.length > 0) {
    await db.delete(workspaces).where(
      inArray(
        workspaces.id,
        theirs.map((m) => m.workspaceId),
      ),
    );
  }
  const everyone = [...peopleIds, ...guests.map((g) => g.userId)];
  await db.delete(auditLog).where(inArray(auditLog.actorId, everyone));
  await db.delete(users).where(inArray(users.id, everyone));
  for (const { email } of [OWNER, FRIEND, NEWBIE]) {
    const digest = createHash('sha256').update(email).digest('hex');
    await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  for (const { email, name } of [OWNER, FRIEND, NEWBIE]) {
    const response = await fetch(`${GATEWAY}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ email, password: PASSWORD, name, termsVersion: TERMS_VERSION }),
    });
    expect(response.status, `signup for ${name}`).toBe(201);
    const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email));
    ids[email] = row!.id;
  }
  // Only a confirmed address is written to; how it was confirmed is not what this is about.
  await db!
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(like(users.email, `${PREFIX}%`));

  owner = await signIn(browser, OWNER.email);
  const [board] = await db!
    .select({ id: boards.id, workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.ownerId, ids[OWNER.email]!));
  boardId = board!.id;
  workspaceId = board!.workspaceId;
  linkToken = (await createShareLink(db!, { boardId, createdBy: ids[OWNER.email]! })).token;
  const invited = await createWorkspaceInvite(db!, {
    workspaceId,
    email: NEWBIE.email,
    role: 'member',
    invitedBy: ids[OWNER.email]!,
  });
  if (!invited.ok) throw new Error(`could not invite: ${invited.reason}`);
  inviteToken = invited.token;
});

test.afterAll(async () => {
  await cleanUp();
});

test('somebody new through a share link emails whoever made it, once in a while', async ({
  browser,
}) => {
  const joinAsGuest = async (name: string) => {
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(`${WEB}/invite/${linkToken}`);
    await guest.getByLabel('Your name').fill(name);
    await guest.getByRole('button', { name: 'Join board' }).click();
    await guest.waitForURL(new RegExp(`/boards/${boardId}`), { timeout: 45_000 });
    await guest.context().close();
  };

  // "Invite accepted" starts off: recorded, not mailed.
  const friend = await signIn(browser, FRIEND.email);
  await friend.goto(`${WEB}/invite/${linkToken}`);
  await friend.getByRole('button', { name: 'Open board' }).click();
  await friend.waitForURL(new RegExp(`/boards/${boardId}`), { timeout: 45_000 });
  await expectNotices(OWNER.email, 'board-joined', [false]);

  // Turned on, the next person in is mailed.
  await setSwitch(OWNER.email, 'inviteAccepted', true);
  await joinAsGuest(GUEST_NAME);
  await expectNotices(OWNER.email, 'board-joined', [false, true]);

  // Opening the link again is not somebody new.
  await friend.goto(`${WEB}/invite/${linkToken}`);
  await friend.getByRole('button', { name: 'Open board' }).click();
  await friend.waitForURL(new RegExp(`/boards/${boardId}`), { timeout: 45_000 });

  // Another right after: recorded, and held, since the owner just heard.
  await joinAsGuest(`${GUEST_NAME} two`);
  await expectNotices(OWNER.email, 'board-joined', [false, true, false]);
  await friend.context().close();
});

test('an accepted workspace invitation emails whoever sent it', async ({ browser }) => {
  const newbie = await signIn(browser, NEWBIE.email);
  await newbie.goto(`${WEB}/join/${inviteToken}`);
  await newbie.getByRole('button', { name: /^Join / }).click();
  await newbie.waitForURL(/localhost:3002\/boards\//, { timeout: 45_000 });
  await expectNotices(OWNER.email, 'workspace-joined', [true]);
  await newbie.context().close();
});

test('a change to somebody’s board access emails them; a run of changes once, a removal never', async () => {
  const friendId = ids[FRIEND.email]!;

  expect((await setBoardRole(friendId, 'viewer')).status()).toBe(200);
  await expectNotices(FRIEND.email, 'access-changed', [true]);

  // Straight back again: recorded, held. The same role again: nothing at all.
  expect((await setBoardRole(friendId, 'editor')).status()).toBe(200);
  await expectNotices(FRIEND.email, 'access-changed', [true, false]);
  expect((await setBoardRole(friendId, 'editor')).status()).toBe(200);

  // Removed: no email.
  const removed = await owner.request.delete(`${WEB}/api/boards/${boardId}/members/${friendId}`);
  expect(removed.status()).toBe(200);

  // Let back on, a while later: emailed.
  await forgetRecentEmails(FRIEND.email, 'access-changed');
  expect((await setBoardRole(friendId, 'editor')).status()).toBe(200);
  await expectNotices(FRIEND.email, 'access-changed', [true, false, true]);
});

test('a workspace role change, and a guest’s access from the member list, email them', async () => {
  const promoted = await owner.request.patch(
    `${GATEWAY}/workspaces/${workspaceId}/members/${ids[NEWBIE.email]!}`,
    { headers: { Origin: EDITOR }, data: { role: 'admin' } },
  );
  expect(promoted.status()).toBe(204);
  await expectNotices(NEWBIE.email, 'access-changed', [true]);

  // Fay is on the owner's board by link, not in the workspace: a guest.
  await forgetRecentEmails(FRIEND.email, 'access-changed');
  const guestChange = (role: 'editor' | 'viewer') =>
    owner.request.patch(`${GATEWAY}/workspaces/${workspaceId}/guests/${ids[FRIEND.email]!}`, {
      headers: { Origin: EDITOR },
      data: { role },
    });
  expect((await guestChange('viewer')).status()).toBe(204);
  await expectNotices(FRIEND.email, 'access-changed', [true, false, true, true]);
  // What they already have: nothing.
  expect((await guestChange('viewer')).status()).toBe(204);

  // With the switch off, a change is recorded and not mailed.
  await setSwitch(FRIEND.email, 'accessChanges', false);
  await forgetRecentEmails(FRIEND.email, 'access-changed');
  expect((await guestChange('editor')).status()).toBe(204);
  await expectNotices(FRIEND.email, 'access-changed', [true, false, true, true, false]);
});

test('the internal route takes only our own services, and only events it knows', async () => {
  const post = (headers: Record<string, string>, body: unknown) =>
    fetch(`${GATEWAY}/internal/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then((res) => res.status);
  const event = { event: 'board-joined', boardId, userId: ids[FRIEND.email]! };
  const credential = createHmac('sha256', secret!)
    .update('canvasflow:internal:notify:v1')
    .digest('hex');

  expect(await post({}, event)).toBe(401);
  expect(await post({ 'x-canvasflow-internal': 'nope' }, event)).toBe(401);
  // Another route's credential is not this one's.
  const other = createHmac('sha256', secret!)
    .update('canvasflow:internal:board-access:v1')
    .digest('hex');
  expect(await post({ 'x-canvasflow-internal': other }, event)).toBe(401);
  expect(await post({ 'x-canvasflow-internal': credential }, { event: 'made-up' })).toBe(400);
  // A real event reported again is a repeat: nothing more is recorded.
  expect(await post({ 'x-canvasflow-internal': credential }, event)).toBe(202);
  await expect.poll(() => notices(OWNER.email, 'board-joined')).toEqual([false, true, false]);
});
