import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { eq, inArray } from 'drizzle-orm';
import {
  auditLog,
  createClient,
  memberships,
  signInFailures,
  users,
  workspaces,
} from '@canvasflow/db';
import { TERMS_VERSION } from '@canvasflow/types';

/**
 * Settings → Notifications, end to end, through the real editor.
 *
 * One account signed in on two devices. A switch flipped on one is saved,
 * says so, and flips on the other within seconds without a reload; a reload
 * finds it as it was left. The route refuses another site and anything that
 * is not a switch.
 *
 * Needs the local web app, editor, gateway and sync-server running. The
 * account is made through the real signup route, on Resend's test inbox, and
 * removed afterwards — which is why it reads DATABASE_URL, from the
 * repository's .env when it is not already set.
 *
 *   pnpm --filter @canvasflow/e2e test:e2e --project=notifications
 */

try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Already in the environment, or not available; the check below says which.
}

const WEB = 'http://localhost:3000';
const GATEWAY = 'http://localhost:3001';
const RUN = randomUUID().slice(0, 8);
const PASSWORD = 'E2e!Notify-one1';
const PERSON = { email: `delivered+e2e-notify-${RUN}@resend.dev`, name: `E2E Notify ${RUN}` };

const db = process.env.DATABASE_URL ? createClient(process.env.DATABASE_URL) : null;

test.describe.configure({ mode: 'serial', timeout: 90_000 });

test.skip(!db, 'DATABASE_URL is not set');
test.skip(process.env.NODE_ENV === 'production', 'refusing to run against production');

/** A fresh browser — another device — signed in through the real form, with a board open. */
async function signedIn(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${WEB}/login`);
  await page.getByPlaceholder('you@example.com').fill(PERSON.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(/localhost:3002\/boards\//, { timeout: 30_000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  return page;
}

async function openNotifications(page: Page) {
  await page.getByTestId('menu-account').click();
  await page.getByTestId('menu-item-settings').click();
  const pane = page.getByTestId('settings-dialog');
  await pane.getByTestId('settings-tab-notifications').click();
  return pane;
}

function toggle(pane: ReturnType<Page['getByTestId']>, title: string) {
  return pane.getByRole('switch', { name: title, exact: true });
}

async function storedSwitches(): Promise<unknown> {
  const [row] = await db!
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.email, PERSON.email));
  return row?.preferences.notifications;
}

test.beforeAll(async () => {
  const response = await fetch(`${GATEWAY}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ ...PERSON, password: PASSWORD, termsVersion: TERMS_VERSION }),
  });
  expect(response.status, 'signup').toBe(201);
});

test.afterAll(async () => {
  if (!db) return;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, PERSON.email));
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
  const digest = createHash('sha256').update(PERSON.email).digest('hex');
  await db.delete(signInFailures).where(eq(signInFailures.emailHash, digest));
});

test('a switch flipped on one device is saved and flips on the other', async ({ browser }) => {
  const laptop = await signedIn(browser);
  const phone = await signedIn(browser);
  const onLaptop = await openNotifications(laptop);
  const onPhone = await openNotifications(phone);

  // An account that never chose reads the defaults, and nothing is stored.
  for (const pane of [onLaptop, onPhone]) {
    await expect(toggle(pane, 'Comment mentions')).toBeEnabled();
    await expect(toggle(pane, 'Access changes')).toHaveAttribute('aria-checked', 'true');
    await expect(toggle(pane, 'Comment mentions')).toHaveAttribute('aria-checked', 'true');
    await expect(toggle(pane, 'Weekly digest')).toHaveAttribute('aria-checked', 'false');
  }
  expect(await storedSwitches()).toBeUndefined();

  await toggle(onLaptop, 'Comment mentions').click();
  await expect(onLaptop.locator('section[aria-label="Email"]').getByText('Saved')).toBeVisible();
  expect(await storedSwitches()).toEqual({ commentMentions: false });
  // The other device follows without a reload.
  await expect(toggle(onPhone, 'Comment mentions')).toHaveAttribute('aria-checked', 'false', {
    timeout: 5_000,
  });

  // And back the other way, in the other band.
  await toggle(onPhone, 'Weekly digest').click();
  await expect(onPhone.locator('section[aria-label="Digest"]').getByText('Saved')).toBeVisible();
  await expect(toggle(onLaptop, 'Weekly digest')).toHaveAttribute('aria-checked', 'true', {
    timeout: 5_000,
  });
  expect(await storedSwitches()).toEqual({ commentMentions: false, weeklyDigest: true });

  // Quick flips of several switches all land.
  await toggle(onLaptop, 'Invite accepted').click();
  await toggle(onLaptop, 'Product updates').click();
  await toggle(onLaptop, 'Access changes').click();
  await expect.poll(storedSwitches).toEqual({
    commentMentions: false,
    weeklyDigest: true,
    inviteAccepted: true,
    productUpdates: true,
    accessChanges: false,
  });
  for (const pane of [onLaptop, onPhone]) {
    for (const title of ['Invite accepted', 'Product updates']) {
      await expect(toggle(pane, title)).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });
    }
    await expect(toggle(pane, 'Access changes')).toHaveAttribute('aria-checked', 'false', {
      timeout: 5_000,
    });
  }

  // A reload finds them as they were left.
  await laptop.reload();
  await expect(laptop.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  const again = await openNotifications(laptop);
  await expect(toggle(again, 'Comment mentions')).toHaveAttribute('aria-checked', 'false');
  await expect(toggle(again, 'Weekly digest')).toHaveAttribute('aria-checked', 'true');
  await expect(toggle(again, 'Comment mentions')).toBeEnabled();
});

test('the route refuses another site, and anything that is not a switch', async ({ browser }) => {
  const page = await signedIn(browser);
  const statuses = await page.evaluate(async (gateway) => {
    const patch = (body: unknown) =>
      fetch(`${gateway}/users/me/notifications`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((res) => res.status);
    return {
      unknown: await patch({ theme: 'dark' }),
      notBoolean: await patch({ commentMentions: 'no' }),
      empty: await patch({}),
    };
  }, GATEWAY);
  expect(statuses).toEqual({ unknown: 400, notBoolean: 400, empty: 400 });

  // A page on another origin cannot send the browser's Origin, so this says
  // what the route does with one that is not ours.
  const cookies = await page.context().cookies(GATEWAY);
  const forged = await fetch(`${GATEWAY}/users/me/notifications`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://evil.example',
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    },
    body: JSON.stringify({ commentMentions: true }),
  });
  expect(forged.status).toBe(403);
  expect(await storedSwitches()).toMatchObject({ commentMentions: false });
});
