import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeJwt, jwtVerify } from 'jose';
import { BOARD_TOKEN_TTL_SECONDS } from './editor-token.service.js';
import {
  Client,
  TEST_AUTH_SECRET,
  WEB_URL,
  signIn,
  signUpAndIn,
  startGateway,
  type Gateway,
} from '../../testing/gateway.js';
import { addMember, createBoard, createTeam, shareBoard } from '../../testing/seed.js';

/**
 * The editor's way in: the short-lived board token minted from the web
 * session, the board a signed-in visitor lands on, and the redirect that
 * sends someone back to sign in.
 */

let gateway: Gateway;

beforeAll(async () => {
  gateway = await startGateway();
});

afterAll(async () => {
  await gateway.close();
});

const secret = new TextEncoder().encode(TEST_AUTH_SECRET);

async function landingBoard(client: Client): Promise<string> {
  const reply = await client.get<{ boardId: string }>('/auth/landing-board');
  expect(reply.status).toBe(200);
  return reply.body.boardId;
}

describe('the board token', () => {
  it('is signed, names the board and the role, and lasts five minutes', async () => {
    const owner = await signUpAndIn(gateway, 'token-owner');
    const boardId = await landingBoard(owner.client);

    const reply = await owner.client.get<{ token: string; expiresAt: number; boardId: string }>(
      `/auth/editor-token?boardId=${boardId}`,
    );
    expect(reply.status).toBe(200);
    expect(reply.body.boardId).toBe(boardId);

    const { payload } = await jwtVerify(reply.body.token, secret);
    expect(payload).toMatchObject({ id: owner.id, boardId, role: 'owner', accessSource: 'owner' });
    expect(payload.sid).toBe(decodeJwt(owner.client.accessToken).sid);
    const lifetime = payload.exp! - payload.iat!;
    expect(lifetime).toBe(BOARD_TOKEN_TTL_SECONDS);
  });

  it('carries the role someone was given, not more', async () => {
    const owner = await signUpAndIn(gateway, 'share-owner');
    const viewer = await signUpAndIn(gateway, 'share-viewer');
    const boardId = await landingBoard(owner.client);
    await shareBoard(gateway, boardId, viewer, 'viewer', owner);

    const reply = await viewer.client.get<{ token: string }>(
      `/auth/editor-token?boardId=${boardId}`,
    );
    expect(reply.status).toBe(200);
    expect(decodeJwt(reply.body.token)).toMatchObject({
      role: 'viewer',
      accessSource: 'board-member',
    });
  });

  it('is minted for a workspace member as an editor', async () => {
    const owner = await signUpAndIn(gateway, 'ws-owner');
    const member = await signUpAndIn(gateway, 'ws-member');
    const workspaceId = await createTeam(gateway, owner);
    await addMember(gateway, workspaceId, member);
    const boardId = await createBoard(owner, workspaceId);

    const reply = await member.client.get<{ token: string }>(
      `/auth/editor-token?boardId=${boardId}`,
    );
    expect(reply.status).toBe(200);
    expect(decodeJwt(reply.body.token)).toMatchObject({
      role: 'editor',
      accessSource: 'workspace',
    });
  });

  it('is never minted for a board someone has no access to', async () => {
    const owner = await signUpAndIn(gateway, 'private-owner');
    const outsider = await signUpAndIn(gateway, 'outsider');
    const boardId = await landingBoard(owner.client);

    const reply = await outsider.client.get(`/auth/editor-token?boardId=${boardId}`);
    // Not found rather than forbidden: whether a board exists is not shared.
    expect(reply.status).toBe(404);
  });

  it('is refused once the access is revoked', async () => {
    const owner = await signUpAndIn(gateway, 'revoke-owner');
    const guest = await signUpAndIn(gateway, 'revoke-guest');
    const boardId = await landingBoard(owner.client);
    await shareBoard(gateway, boardId, guest, 'editor', owner);
    expect((await guest.client.get(`/auth/editor-token?boardId=${boardId}`)).status).toBe(200);

    const { boardMembers } = await import('@canvasflow/db');
    const { and, eq } = await import('drizzle-orm');
    await gateway.db
      .update(boardMembers)
      .set({ status: 'revoked' })
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, guest.id)));

    expect((await guest.client.get(`/auth/editor-token?boardId=${boardId}`)).status).toBe(404);
  });

  it('needs a session, a board id and a well-formed one', async () => {
    const account = await signUpAndIn(gateway, 'token-input');
    expect((await new Client(gateway).get('/auth/editor-token?boardId=x')).status).toBe(401);
    expect((await account.client.get('/auth/editor-token')).status).toBe(400);
    expect((await account.client.get('/auth/editor-token?boardId=not-a-uuid')).status).toBe(404);
  });

  it('is refused after signing out', async () => {
    const account = await signUpAndIn(gateway, 'token-signout');
    const boardId = await landingBoard(account.client);
    const cookies = new Map(account.client.cookies);
    await account.client.post('/auth/signout');

    const stale = new Client(gateway);
    for (const [name, value] of cookies) stale.cookies.set(name, value);
    expect((await stale.get(`/auth/editor-token?boardId=${boardId}`)).status).toBe(401);
  });

  it('renews the session from the refresh cookie when the access cookie is gone', async () => {
    const account = await signUpAndIn(gateway, 'token-renew');
    const boardId = await landingBoard(account.client);
    const refreshBefore = account.client.cookies.get('cf.refresh');
    account.client.cookies.delete('cf.access');

    const reply = await account.client.get(`/auth/editor-token?boardId=${boardId}`);
    expect(reply.status).toBe(200);
    expect(account.client.cookies.get('cf.access')).toBeDefined();
    expect(account.client.cookies.get('cf.refresh')).not.toBe(refreshBefore);
  });
});

describe('the landing board', () => {
  it('is the same board every time', async () => {
    const account = await signUpAndIn(gateway, 'landing');
    const first = await landingBoard(account.client);
    expect(await landingBoard(account.client)).toBe(first);
    const reply = await account.client.get('/auth/landing-board');
    expect(reply.headers.get('cache-control')).toBe('no-store');
  });

  it('needs a session', async () => {
    expect((await new Client(gateway).get('/auth/landing-board')).status).toBe(401);
  });
});

describe('resume', () => {
  it('sends a signed-in visitor on to where they were going', async () => {
    const account = await signUpAndIn(gateway, 'resume');
    const reply = await account.client.get('/auth/resume?next=/boards');
    expect(reply.status).toBe(302);
    expect(reply.headers.get('location')).toBe(`${WEB_URL}/boards`);
  });

  it('sends anyone else to sign in, and never off the site', async () => {
    const anonymous = new Client(gateway);
    const reply = await anonymous.get('/auth/resume?next=/boards');
    expect(reply.status).toBe(302);
    const location = new URL(reply.headers.get('location')!);
    expect(location.origin + location.pathname).toBe(`${WEB_URL}/login`);
    expect(location.searchParams.get('next')).toBe('/boards');

    const offsite = await signIn(gateway, (await signUpAndIn(gateway, 'resume-offsite')).email);
    const away = await offsite.client.get('/auth/resume?next=//evil.example/x');
    expect(new URL(away.headers.get('location')!).origin).toBe(WEB_URL);
  });
});
