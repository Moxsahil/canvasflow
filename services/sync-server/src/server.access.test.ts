import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  ACCOUNT_CHANGED_PURPOSE,
  COMMENT_LOOKUP_PURPOSE,
  INTERNAL_AUTH_HEADER,
  WORKSPACE_CHANGED_PURPOSE,
  internalToken,
} from './security/internal-auth.js';
import {
  AUTH_SECRET,
  connect,
  mintToken,
  seed,
  sleep,
  sql,
  startServer,
  waitFor,
  type Client,
  type RunningServer,
  type Seed,
} from './testing/harness.js';

/**
 * Access that changes while a board is open, and the HTTP routes the web app
 * and gateway call to say so.
 */
describe('live access changes and internal routes', () => {
  let srv: RunningServer;
  const clients: Client[] = [];

  async function join(s: Seed, who: 'owner' | 'member' | 'viewer') {
    const token = await mintToken({
      userId: s[who].userId,
      sessionId: s[who].sessionId,
      boardId: s.boardId,
      workspaceId: s.workspaceId,
      role: who === 'owner' ? 'owner' : who === 'viewer' ? 'viewer' : 'editor',
    });
    const client = connect(srv.url, s.boardId, token);
    clients.push(client);
    const messages: Record<string, unknown>[] = [];
    client.provider.on('stateless', ({ payload }: { payload: string }) =>
      messages.push(JSON.parse(payload) as Record<string, unknown>),
    );
    await client.ready;
    return { client, messages };
  }
  const connectionsFor = (s: Seed, userId: string) =>
    srv.server.hocuspocus.documents
      .get(s.boardId)
      ?.getConnections()
      .filter((c) => (c.context as { userId?: string }).userId === userId).length ?? 0;
  const post = (path: string, body: unknown, credential?: string) =>
    fetch(`http://127.0.0.1:${srv.httpPort}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(credential ? { [INTERNAL_AUTH_HEADER]: credential } : {}),
      },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    srv = await startServer();
  });
  afterAll(async () => {
    for (const c of clients) c.destroy();
    await srv.stop();
  });

  it('GET /health reports the open connections and documents', async () => {
    const res = await fetch(`http://127.0.0.1:${srv.httpPort}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', connections: expect.any(Number) });
  });

  it('POST /internal/board-access closes a removed person’s open board at once', async () => {
    const s = await seed();
    const { messages } = await join(s, 'member');
    expect(connectionsFor(s, s.member.userId)).toBe(1);

    await sql(
      `insert into board_members (board_id, user_id, role, status, granted_by) values ($1, $2, 'editor', 'revoked', $3)`,
      [s.boardId, s.member.userId, s.owner.userId],
    );
    const res = await post(
      '/internal/board-access',
      { boardId: s.boardId, userId: s.member.userId },
      internalToken(AUTH_SECRET),
    );
    expect(await res.json()).toEqual({ ok: true, matched: 1, revoked: 1, changed: 0 });
    await waitFor(() => messages.some((m) => m.type === 'access-revoked'), {
      what: 'access-revoked message',
    });
    await waitFor(() => connectionsFor(s, s.member.userId) === 0, { what: 'socket closed' });
  });

  it('POST /internal/board-access turns an editor demoted to viewer read-only without a reconnect', async () => {
    const s = await seed();
    const owner = await join(s, 'owner');
    const member = await join(s, 'member');

    await sql(
      `insert into board_members (board_id, user_id, role, granted_by) values ($1, $2, 'viewer', $3)`,
      [s.boardId, s.member.userId, s.owner.userId],
    );
    const res = await post(
      '/internal/board-access',
      { boardId: s.boardId, userId: s.member.userId },
      internalToken(AUTH_SECRET),
    );
    expect(await res.json()).toMatchObject({ matched: 1, changed: 1 });
    await waitFor(
      () => member.messages.some((m) => m.type === 'access-changed' && m.canEdit === false),
      { what: 'access-changed message' },
    );

    member.client.doc.getMap('shapes').set('after-demotion', 1);
    owner.client.doc.getMap('shapes').set('owner-edit', 1);
    await waitFor(() => member.client.doc.getMap('shapes').has('owner-edit'), {
      what: 'owner edit at member',
    });
    await sleep(200);
    expect(owner.client.doc.getMap('shapes').has('after-demotion')).toBe(false);
  });

  it('the periodic sweep ends connections whose session was signed out', async () => {
    const s = await seed();
    const { messages } = await join(s, 'owner');
    await sql(`update auth_sessions set revoked_at = now() where id = $1`, [s.owner.sessionId]);
    // The sweep runs every five seconds.
    await waitFor(() => messages.some((m) => m.type === 'session-ended'), {
      what: 'session-ended message',
      timeout: 8_000,
    });
    await waitFor(() => connectionsFor(s, s.owner.userId) === 0, { what: 'socket closed' });
  }, 15_000);

  it('internal routes refuse a missing or wrong credential', async () => {
    const s = await seed();
    const body = { boardId: s.boardId, userId: s.owner.userId };
    expect((await post('/internal/board-access', body)).status).toBe(401);
    // Each route has its own credential; one cannot be replayed on another.
    expect(
      (
        await post(
          '/internal/board-access',
          body,
          internalToken(AUTH_SECRET, WORKSPACE_CHANGED_PURPOSE),
        )
      ).status,
    ).toBe(401);
    expect((await post('/internal/workspace-changed', { workspaceId: s.workspaceId })).status).toBe(
      401,
    );
    expect((await post('/internal/account-changed', { userId: s.owner.userId })).status).toBe(401);
    expect((await post('/internal/comment-lookup', {})).status).toBe(401);
  });

  it('internal routes reject malformed bodies', async () => {
    const access = internalToken(AUTH_SECRET);
    expect((await post('/internal/board-access', { boardId: 1 }, access)).status).toBe(400);
    expect(
      (
        await post(
          '/internal/workspace-changed',
          { workspaceId: 'not-a-uuid' },
          internalToken(AUTH_SECRET, WORKSPACE_CHANGED_PURPOSE),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          '/internal/account-changed',
          { userId: '00000000-0000-0000-0000-000000000000', part: 'password' },
          internalToken(AUTH_SECRET, ACCOUNT_CHANGED_PURPOSE),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          '/internal/comment-lookup',
          { boardId: '00000000-0000-0000-0000-000000000000', threadId: 'a b', commentId: 'c' },
          internalToken(AUTH_SECRET, COMMENT_LOOKUP_PURPOSE),
        )
      ).status,
    ).toBe(400);
  });

  it('POST /internal/workspace-changed and /internal/account-changed reach the open boards', async () => {
    const s = await seed();
    const owner = await join(s, 'owner');

    const ws = await post(
      '/internal/workspace-changed',
      { workspaceId: s.workspaceId },
      internalToken(AUTH_SECRET, WORKSPACE_CHANGED_PURPOSE),
    );
    expect(await ws.json()).toEqual({ ok: true, told: 1 });

    const account = await post(
      '/internal/account-changed',
      { userId: s.owner.userId, part: 'notifications' },
      internalToken(AUTH_SECRET, ACCOUNT_CHANGED_PURPOSE),
    );
    expect(await account.json()).toEqual({ ok: true, told: 1 });

    await waitFor(() => owner.messages.length >= 2, { what: 'two announcements' });
    expect(owner.messages.map((m) => m.type).sort()).toEqual([
      'account-changed',
      'workspace-changed',
    ]);
  });

  it('POST /internal/comment-lookup answers from the open document only', async () => {
    const s = await seed();
    const owner = await join(s, 'owner');
    owner.client.doc.transact(() => {
      const thread = new Y.Map<unknown>();
      const comments = new Y.Array<Y.Map<unknown>>();
      const comment = new Y.Map<unknown>();
      comment.set('id', 'c-1');
      comment.set('authorId', s.owner.userId);
      comment.set('body', 'Looks good @Mo');
      comment.set('mentions', [{ id: s.member.userId }, { id: s.member.userId }]);
      comments.push([comment]);
      thread.set('comments', comments);
      owner.client.doc.getMap('comments').set('t-1', thread);
    });

    const ask = (body: Record<string, string>) =>
      post(
        '/internal/comment-lookup',
        body,
        internalToken(AUTH_SECRET, COMMENT_LOOKUP_PURPOSE),
      ).then((r) => r.json() as Promise<{ comment: unknown }>);
    await waitFor(
      async () => (await ask({ boardId: s.boardId, threadId: 't-1', commentId: 'c-1' })).comment,
      { what: 'comment visible to the server' },
    );
    expect(await ask({ boardId: s.boardId, threadId: 't-1', commentId: 'c-1' })).toEqual({
      comment: { authorId: s.owner.userId, body: 'Looks good @Mo', mentionIds: [s.member.userId] },
    });
    expect(await ask({ boardId: s.boardId, threadId: 't-1', commentId: 'missing' })).toEqual({
      comment: null,
    });
    // A board nobody has open answers nothing, whatever is stored for it.
    expect(await ask({ boardId: s.otherBoardId, threadId: 't-1', commentId: 'c-1' })).toEqual({
      comment: null,
    });
  });
});
