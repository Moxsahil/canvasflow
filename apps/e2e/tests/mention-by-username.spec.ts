import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  boardMembers,
  createClient,
  memberships,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * @mentions by username, end to end, with two people on one board.
 *
 * The writer is offered the reader by the start of their username, sees it
 * beside their name in the list, and picks them; then names them a second time
 * by typing the username out. Both comments name the reader as themselves.
 *
 * Needs the local web app, editor, gateway and sync-server running. Both
 * accounts are made through the real signup route, on Resend's test inbox,
 * given usernames and a shared board straight in the database, and removed
 * afterwards. Runs with the other username checks: `--project=username`.
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
const PASSWORD = 'E2e!Mention-one1';

const WRITER = {
  email: `delivered+e2e-writer-${RUN}@resend.dev`,
  name: `Writer ${RUN}`,
  username: `writer_${RUN}`,
};
const READER = {
  email: `delivered+e2e-reader-${RUN}@resend.dev`,
  name: `Reader ${RUN}`,
  username: `reader.${RUN}`,
};

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

async function idOf(email: string): Promise<string> {
  const [row] = await db!.select({ id: users.id }).from(users).where(eq(users.email, email));
  return row!.id;
}

async function signedIn(browser: Browser, email: string, at?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  if (at) await page.goto(at);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  return page;
}

test.beforeAll(async () => {
  for (const person of [WRITER, READER]) {
    const response = await fetch(`${GATEWAY}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: WEB },
      body: JSON.stringify({
        email: person.email,
        password: PASSWORD,
        name: person.name,
        termsVersion: TERMS_VERSION,
      }),
    });
    expect(response.status, `signup for ${person.name}`).toBe(201);
    await db!.update(users).set({ username: person.username }).where(eq(users.email, person.email));
  }
});

test.afterAll(async () => {
  if (!db) return;
  for (const { email } of [WRITER, READER]) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (row) {
      // Boards name their owner without a cascade, so the workspaces go first.
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

test('offers a collaborator by their username, and names them by it typed out', async ({
  browser,
}) => {
  const writer = await signedIn(browser, WRITER.email);
  const boardId = new URL(writer.url()).pathname.split('/').pop()!;
  const readerId = await idOf(READER.email);

  // On the writer's board, as an editor, as sharing it would have made them.
  await db!.insert(boardMembers).values({
    boardId,
    userId: readerId,
    role: 'editor',
    grantedBy: await idOf(WRITER.email),
  });
  const reader = await signedIn(browser, READER.email, `${EDITOR}/boards/${boardId}`);

  // Each on the other's screen — the avatar is titled with their name — which
  // is how the reader's username reaches the writer: on their presence record.
  await expect(writer.locator(`[title^="${READER.name}"]`)).toBeVisible({ timeout: 20_000 });

  // A new comment on the board.
  await writer.keyboard.press('m');
  const canvas = writer.locator('canvas').last();
  const box = (await canvas.boundingBox())!;
  await writer.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const composer = writer.getByTestId('comment-new').getByRole('textbox');
  await expect(composer).toBeVisible();

  // The start of the username finds them, with it shown beside their name.
  await composer.pressSequentially(`Over to @reader.${RUN.slice(0, 3)}`);
  const option = writer.getByTestId('comment-mention-option');
  await expect(option).toHaveCount(1);
  await expect(option).toContainText(READER.name);
  await expect(option).toContainText(`@${READER.username}`);

  // Picking writes their name, as it always has.
  await composer.press('Enter');
  await expect(composer).toHaveValue(`Over to @${READER.name} `);
  await composer.press('Enter');

  // The thread, open, with the first comment naming the reader.
  await writer.getByTestId('comment-pin').first().click();
  const thread = writer.getByTestId('comment-thread');
  await expect(thread.locator(`[data-mention="${readerId}"]`)).toHaveText(`@${READER.name}`);

  // A reply naming them by their username typed out, never picked from the list.
  const reply = thread.getByRole('textbox');
  await reply.pressSequentially(`cc @${READER.username} thanks`);
  await expect(writer.getByTestId('comment-mention-list')).toHaveCount(0);
  await reply.press('Enter');
  await expect(thread.getByTestId('comment-card')).toHaveCount(2);
  await expect(
    thread.getByTestId('comment-card').nth(1).locator(`[data-mention="${readerId}"]`),
  ).toHaveText(`@${READER.username}`);

  // On the reader's screen, both are marked as addressed to them.
  await reader.getByTestId('comment-pin').first().click();
  const readerThread = reader.getByTestId('comment-thread');
  await expect(readerThread.locator(`[data-mention="${readerId}"]`)).toHaveCount(2, {
    timeout: 15_000,
  });

  // Reply on the writer's comment names the writer in the reply, caret after.
  const writerId = await idOf(WRITER.email);
  const first = readerThread.getByTestId('comment-card').first();
  await first.hover();
  await first.getByTestId('comment-reply').click();
  const readerReply = readerThread.getByRole('textbox');
  await expect(readerReply).toHaveValue(`@${WRITER.name} `);
  await expect(readerReply).toBeFocused();
  await readerReply.pressSequentially('on it');
  await readerReply.press('Enter');
  await expect(readerThread.getByTestId('comment-card')).toHaveCount(3);
  await expect(
    readerThread.getByTestId('comment-card').nth(2).locator(`[data-mention="${writerId}"]`),
  ).toHaveText(`@${WRITER.name}`);
  // Your own comment has no Reply: there is nobody to answer.
  await expect(
    readerThread.getByTestId('comment-card').nth(2).getByTestId('comment-reply'),
  ).toHaveCount(0);

  // The writer's own comment keeps Edit and Delete behind its three dots, as
  // two buttons in a small bubble.
  const own = thread.getByTestId('comment-card').first();
  await own.hover();
  await own.getByTestId('comment-more').click();
  await expect(writer.getByTestId('comment-delete')).toBeVisible();
  await writer.getByTestId('comment-edit').click();
  const editing = thread.getByRole('textbox', { name: 'Edit comment' });
  await expect(editing).toBeVisible();
  await editing.press('Escape');
  await expect(thread.getByTestId('comment-card')).toHaveCount(3);
});
