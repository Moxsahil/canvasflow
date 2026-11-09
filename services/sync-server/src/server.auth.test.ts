import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { saveSnapshot } from './persistence/board-updates-store.js';
import {
  connect,
  mintToken,
  rawAuth,
  seed,
  sql,
  startServer,
  testDb,
  waitFor,
  type Client,
  type RunningServer,
  type Seed,
} from './testing/harness.js';

/**
 * onAuthenticate is the security boundary: every check it makes is driven here
 * by a real provider over a real socket, against the real database.
 */
describe('onAuthenticate', () => {
  let srv: RunningServer;
  let s: Seed;
  const clients: Client[] = [];

  const open = (boardId: string, token: string, origin?: string) => {
    const client = connect(srv.url, boardId, token, origin ? { origin } : {});
    clients.push(client);
    return client;
  };
  const ownerToken = (overrides: Partial<Parameters<typeof mintToken>[0]> = {}) =>
    mintToken({
      userId: s.owner.userId,
      sessionId: s.owner.sessionId,
      boardId: s.boardId,
      workspaceId: s.workspaceId,
      ...overrides,
    });
  const rejections = () => srv.log.entries.filter((e) => e.msg.startsWith('rejected:'));

  beforeAll(async () => {
    s = await seed();
    srv = await startServer();
  });
  beforeEach(() => {
    srv.log.entries.length = 0;
  });
  afterAll(async () => {
    for (const c of clients) c.destroy();
    await srv.stop();
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = await ownerToken({ secret: 'not-the-server-secret-0000000000000000000000' });
    await expect(open(s.boardId, token).ready).rejects.toThrow('permission-denied');
    expect(rejections().map((e) => e.msg)).toEqual(['rejected: token verification failed']);
    expect(String(rejections()[0]!.meta.error)).toMatch(/signature/i);
  });

  it('rejects a token that is not a JWT at all', async () => {
    await expect(open(s.boardId, 'not.a.jwt').ready).rejects.toThrow('permission-denied');
    expect(rejections().map((e) => e.msg)).toEqual(['rejected: token verification failed']);
  });

  it('rejects an expired token', async () => {
    const token = await ownerToken({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
    await expect(open(s.boardId, token).ready).rejects.toThrow('permission-denied');
    expect(rejections().map((e) => e.msg)).toEqual(['rejected: token verification failed']);
    expect(String(rejections()[0]!.meta.error)).toMatch(/exp/);
  });

  it('rejects a token whose claims are incomplete', async () => {
    // Signed correctly, but with a role the database has never issued.
    const token = await ownerToken({ role: 'superuser' as never });
    await expect(open(s.boardId, token).ready).rejects.toThrow('permission-denied');
    expect(String(rejections()[0]!.meta.error)).toMatch(/Invalid role claim/);
  });

  it('rejects a valid token presented for a different board', async () => {
    const token = await ownerToken({ boardId: s.boardId });
    await expect(open(s.otherBoardId, token).ready).rejects.toThrow('permission-denied');
    expect(rejections()).toHaveLength(1);
    expect(rejections()[0]).toMatchObject({
      msg: 'rejected: token/room boardId mismatch',
      meta: { tokenBoardId: s.boardId, requestedRoom: s.otherBoardId },
    });
  });

  it('rejects a handshake from an origin that is not allowed', async () => {
    const token = await ownerToken();
    await expect(open(s.boardId, token, 'https://evil.example').ready).rejects.toThrow(
      'permission-denied',
    );
    expect(rejections()).toHaveLength(1);
    expect(rejections()[0]).toMatchObject({
      msg: 'rejected: origin not allowed',
      meta: { origin: 'https://evil.example' },
    });
  });

  it('rejects a connection with no token', async () => {
    // The provider will not send an empty token, so the frame is built by hand.
    await rawAuth(srv.url, s.boardId, '');
    await waitFor(() => rejections().length > 0, { what: 'rejection' });
    expect(rejections().map((e) => e.msg)).toEqual(['rejected: no token provided']);
  });

  it('rejects a token whose session has been signed out since it was minted', async () => {
    const other = await seed();
    const token = await mintToken({
      userId: other.owner.userId,
      sessionId: other.owner.sessionId,
      boardId: other.boardId,
      workspaceId: other.workspaceId,
    });
    await sql(`update auth_sessions set revoked_at = now() where id = $1`, [other.owner.sessionId]);
    await expect(open(other.boardId, token).ready).rejects.toThrow('session-ended');
    expect(rejections().map((e) => e.msg)).toEqual(['rejected: session has ended']);
  });

  it('rejects a still-valid token once board access is revoked in the database', async () => {
    const token = await mintToken({
      userId: s.member.userId,
      sessionId: s.member.sessionId,
      boardId: s.otherBoardId,
      workspaceId: s.workspaceId,
      role: 'editor',
    });
    // Same token works while the grant stands…
    const before = open(s.otherBoardId, token);
    await before.ready;
    before.destroy();

    // …and is refused on its next connect once the owner removes them from the board.
    await sql(
      `insert into board_members (board_id, user_id, role, status, granted_by) values ($1, $2, 'editor', 'revoked', $3)`,
      [s.otherBoardId, s.member.userId, s.owner.userId],
    );
    srv.log.entries.length = 0;
    await expect(open(s.otherBoardId, token).ready).rejects.toThrow('access-revoked');
    expect(rejections()).toHaveLength(1);
    expect(rejections()[0]).toMatchObject({
      msg: 'rejected: access revoked since token mint',
      meta: { userId: s.member.userId, boardId: s.otherBoardId },
    });
  });

  it('rejects a token for a board that has been deleted', async () => {
    const other = await seed();
    const token = await mintToken({
      userId: other.owner.userId,
      sessionId: other.owner.sessionId,
      boardId: other.boardId,
      workspaceId: other.workspaceId,
    });
    await sql(`update boards set deleted_at = now() where id = $1`, [other.boardId]);
    await expect(open(other.boardId, token).ready).rejects.toThrow('access-revoked');
  });

  it('accepts a valid token and loads that board’s stored document, not another’s', async () => {
    const other = await seed();
    const stored = new Y.Doc();
    stored.getMap('shapes').set('rect-1', 'stored on the board');
    await saveSnapshot(testDb(), other.boardId, other.owner.userId, Y.encodeStateAsUpdate(stored));
    const elsewhere = new Y.Doc();
    elsewhere.getMap('shapes').set('rect-2', 'stored on the other board');
    await saveSnapshot(
      testDb(),
      other.otherBoardId,
      other.owner.userId,
      Y.encodeStateAsUpdate(elsewhere),
    );

    const token = await mintToken({
      userId: other.owner.userId,
      sessionId: other.owner.sessionId,
      boardId: other.boardId,
      workspaceId: other.workspaceId,
    });
    const client = open(other.boardId, token);
    await client.ready;

    expect(client.doc.getMap('shapes').toJSON()).toEqual({ 'rect-1': 'stored on the board' });
    expect(rejections()).toHaveLength(0);
    expect(srv.log.entries.find((e) => e.msg === 'authenticated')?.meta).toMatchObject({
      userId: other.owner.userId,
      boardId: other.boardId,
      role: 'owner',
      readOnly: false,
    });
    expect(srv.log.entries.some((e) => e.msg === 'fetch: loaded prior state')).toBe(true);
  });

  it('starts a board with no stored state empty', async () => {
    const other = await seed();
    const token = await mintToken({
      userId: other.owner.userId,
      sessionId: other.owner.sessionId,
      boardId: other.boardId,
      workspaceId: other.workspaceId,
    });
    const client = open(other.boardId, token);
    await client.ready;
    expect(client.doc.getMap('shapes').size).toBe(0);
    expect(srv.log.entries.some((e) => e.msg === 'fetch: no prior state')).toBe(true);
  });

  it('uses the live role, so a viewer’s edits are neither applied nor saved', async () => {
    const other = await seed();
    const editor = open(
      other.boardId,
      await mintToken({
        userId: other.owner.userId,
        sessionId: other.owner.sessionId,
        boardId: other.boardId,
        workspaceId: other.workspaceId,
      }),
    );
    // The token claims editor; the database says viewer, and the database wins.
    const viewer = open(
      other.boardId,
      await mintToken({
        userId: other.viewer.userId,
        sessionId: other.viewer.sessionId,
        boardId: other.boardId,
        workspaceId: other.workspaceId,
        role: 'editor',
      }),
    );
    await Promise.all([editor.ready, viewer.ready]);
    expect(
      srv.log.entries.find(
        (e) => e.msg === 'authenticated' && e.meta.userId === other.viewer.userId,
      )?.meta,
    ).toMatchObject({ role: 'viewer', readOnly: true });

    viewer.doc.getMap('shapes').set('from-viewer', 1);
    editor.doc.getMap('shapes').set('from-editor', 1);

    // The editor's edit reaches the viewer; the viewer's never reaches the editor.
    await waitFor(() => viewer.doc.getMap('shapes').has('from-editor'), {
      what: 'editor edit at viewer',
    });
    await waitFor(
      async () =>
        (await sql(`select 1 from board_updates where board_id = $1`, [other.boardId])).length > 0,
      {
        what: 'snapshot',
      },
    );
    expect(editor.doc.getMap('shapes').has('from-viewer')).toBe(false);
    const doc = srv.server.hocuspocus.documents.get(other.boardId)!;
    expect(doc.getMap('shapes').has('from-viewer')).toBe(false);
  });
});
