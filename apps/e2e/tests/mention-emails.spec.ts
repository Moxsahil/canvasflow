import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { and, eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  boardMembers,
  createClient,
  memberships,
  notificationDeliveries,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Comment mention emails, end to end, with two people on one board.
 *
 * The writer names the reader in a comment; the reader is recorded and
 * emailed once, however often the comment is reported, and a second mention
 * moments later is recorded without a second email. Nobody but the author can
 * report a comment, and only a comment really on the board. The email's link
 * opens the thread. Its unsubscribe page turns the switch off, after which a
 * mention is recorded and not mailed.
 *
 * Needs the local web app, editor, gateway and sync-server running, and the
 * gateway's RESEND_API_KEY: the reader is on Resend's test inbox, so nothing
 * real is delivered. Both accounts are removed afterwards.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=mentions
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

/** The gateway's own secret, which signs unsubscribe links. Read, never set into this process. */
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
const PASSWORD = 'E2e!Mention-mail1';
const WRITER = { email: `delivered+e2e-mwriter-${RUN}@resend.dev`, name: `Writer ${RUN}` };
const READER = { email: `delivered+e2e-mreader-${RUN}@resend.dev`, name: `Reader ${RUN}` };

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;
const secret = gatewaySecret();

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(!secret, "the gateway's AUTH_SECRET is not readable");
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

let writer: Page;
let reader: Page;
let boardId: string;
let readerId: string;

async function idOf(email: string): Promise<string> {
  const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email));
  return row!.id;
}

async function signedIn(browser: Browser, email: string, at?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  if (at) await page.goto(at);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  return page;
}

/** The reader's mention records on this board, oldest first. */
async function deliveries() {
  return db!
    .select({
      sourceId: notificationDeliveries.sourceId,
      emailedAt: notificationDeliveries.emailedAt,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.recipientId, readerId),
        eq(notificationDeliveries.boardId, boardId),
      ),
    )
    .orderBy(notificationDeliveries.createdAt);
}

/** Post a new comment naming the reader, picked from the @ list. Answers its thread id. */
async function mentionReader(page: Page, text: string): Promise<string> {
  const before = await page.getByTestId('comment-pin').count();
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  const canvas = page.locator('canvas').last();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 3 + before * 60, box.y + box.height / 2);
  const composer = page.getByTestId('comment-new').getByRole('textbox');
  await expect(composer).toBeVisible();
  await composer.pressSequentially(`${text} @Reader ${RUN.slice(0, 3)}`);
  await expect(page.getByTestId('comment-mention-option')).toHaveCount(1);
  await composer.press('Enter');
  await composer.press('Enter');
  await expect(page.getByTestId('comment-pin')).toHaveCount(before + 1);
  return (await page.getByTestId('comment-pin').nth(before).getAttribute('data-thread-id'))!;
}

/** Report a comment's mentions from inside a page, as its editor would. */
function report(page: Page, threadId: string, commentId: string) {
  return page.evaluate(
    async ({ gateway, board, threadId, commentId }) => {
      const res = await fetch(`${gateway}/boards/${board}/mentions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, commentId }),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    },
    { gateway: GATEWAY, board: boardId, threadId, commentId },
  );
}

test.beforeAll(async ({ browser }) => {
  for (const person of [WRITER, READER]) {
    const response = await fetch(`${GATEWAY}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({ ...person, password: PASSWORD, termsVersion: TERMS_VERSION }),
    });
    expect(response.status, `signup for ${person.name}`).toBe(201);
  }
  readerId = await idOf(READER.email);
  // Mail goes only to a confirmed address; how it was confirmed is not what this is about.
  await db!.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, readerId));

  writer = await signedIn(browser, WRITER.email);
  boardId = new URL(writer.url()).pathname.split('/').pop()!;
  await db!.insert(boardMembers).values({
    boardId,
    userId: readerId,
    role: 'editor',
    grantedBy: await idOf(WRITER.email),
  });
  reader = await signedIn(browser, READER.email, `${EDITOR}/boards/${boardId}`);
  // On the writer's screen, which is what puts them in the @ list.
  await expect(writer.locator(`[title^="${READER.name}"]`)).toBeVisible({ timeout: 20_000 });
});

test.afterAll(async () => {
  if (!db) return;
  for (const { email } of [WRITER, READER]) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (row) {
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
    }
    const digest = createHash('sha256').update(email).digest('hex');
    await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
  }
});

let firstThread: string;
let firstComment: string;

test('a mention is emailed once, and a burst of them is one email', async () => {
  firstThread = await mentionReader(writer, 'Have a look');

  // Recorded first, then marked once the provider has taken the email.
  await expect
    .poll(async () => (await deliveries()).map((row) => row.emailedAt !== null), {
      timeout: 15_000,
    })
    .toEqual([true]);
  firstComment = (await deliveries())[0]!.sourceId;

  // Reported again — a retry, a second tab — nothing more is recorded or sent.
  const again = await report(writer, firstThread, firstComment);
  expect(again).toEqual({ status: 200, body: { data: { mentioned: 1, emailed: 0 } } });
  expect(await deliveries()).toHaveLength(1);

  // A second mention moments later is recorded, not mailed.
  await mentionReader(writer, 'And this one');
  await expect.poll(deliveries, { timeout: 15_000 }).toHaveLength(2);
  expect((await deliveries())[1]!.emailedAt).toBeNull();
});

test('only the author can report a comment, and only one on the board', async () => {
  // The reader is an editor here, but not the comment's author.
  expect((await report(reader, firstThread, firstComment)).status).toBe(403);
  // A comment that is not on the board names nobody.
  expect((await report(writer, firstThread, 'comment-made-up')).status).toBe(404);
  expect((await report(writer, 'thread-made-up', firstComment)).status).toBe(404);
  expect(await deliveries()).toHaveLength(2);
});

test("the email's link opens the thread", async ({ browser }) => {
  const page = await signedIn(
    browser,
    READER.email,
    `${EDITOR}/boards/${boardId}?comment=${firstThread}`,
  );
  const thread = page.getByTestId('comment-thread');
  await expect(thread).toBeVisible({ timeout: 15_000 });
  await expect(thread.getByTestId('comment-card').first()).toHaveAttribute(
    'data-comment-id',
    firstComment,
  );
  // Off the address once used.
  await expect.poll(() => new URL(page.url()).searchParams.has('comment')).toBe(false);
  await page.context().close();
});

test('the unsubscribe page turns the switch off, and mentions stop being mailed', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();

  // A token for another switch is refused, and changes nothing.
  const wrong = createHmac('sha256', secret!)
    .update(`canvasflow:unsubscribe:v1:${readerId}:productUpdates`)
    .digest('base64url');
  await page.goto(`${WEB}/unsubscribe?u=${readerId}&k=commentMentions&t=${wrong}`);
  await page.getByRole('button', { name: 'Unsubscribe' }).click();
  // The page's own alert, not the router's empty announcer.
  await expect(page.locator('p[role="alert"]')).toHaveText('This unsubscribe link isn’t valid.');

  const token = createHmac('sha256', secret!)
    .update(`canvasflow:unsubscribe:v1:${readerId}:commentMentions`)
    .digest('base64url');
  await page.goto(`${WEB}/unsubscribe?u=${readerId}&k=commentMentions&t=${token}`);
  await expect(
    page.getByRole('heading', { name: 'Stop emails about comment mentions?' }),
  ).toBeVisible();
  // Opening the page did nothing by itself.
  const [before] = await db!
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, readerId));
  expect(before!.preferences.notifications?.commentMentions).toBeUndefined();

  await page.getByRole('button', { name: 'Unsubscribe' }).click();
  await expect(page.locator('p[role="status"]')).toContainText(
    'You won’t get emails about comment mentions any more.',
  );
  const [after] = await db!
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, readerId));
  expect(after!.preferences.notifications).toEqual({ commentMentions: false });

  // Out of the quiet window, a new mention is recorded and still not mailed.
  await db!
    .update(notificationDeliveries)
    .set({ emailedAt: new Date(Date.now() - 10 * 60_000) })
    .where(eq(notificationDeliveries.recipientId, readerId));
  await mentionReader(writer, 'One more');
  await expect.poll(deliveries, { timeout: 15_000 }).toHaveLength(3);
  expect((await deliveries())[2]!.emailedAt).toBeNull();
  await page.context().close();
});
