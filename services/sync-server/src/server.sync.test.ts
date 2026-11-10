import { afterEach, describe, expect, it } from 'vitest';
import {
  connect,
  mintToken,
  seed,
  sleep,
  startServer,
  storedDoc,
  waitFor,
  type Client,
  type RunningServer,
  type Seed,
} from './testing/harness.js';

/** Two real providers on one board, including the times one of them is cut off. */
describe('collaboration', () => {
  const servers: RunningServer[] = [];
  const clients: Client[] = [];

  async function server(options: Parameters<typeof startServer>[0] = {}) {
    const srv = await startServer(options);
    servers.push(srv);
    return srv;
  }
  async function join(url: string, s: Seed, who: 'owner' | 'member') {
    const token = await mintToken({
      userId: s[who].userId,
      sessionId: s[who].sessionId,
      boardId: s.boardId,
      workspaceId: s.workspaceId,
      role: who === 'owner' ? 'owner' : 'editor',
    });
    const client = connect(url, s.boardId, token);
    clients.push(client);
    await client.ready;
    return client;
  }
  const shapes = (c: Client) => c.doc.getMap('shapes');

  afterEach(async () => {
    for (const c of clients.splice(0)) c.destroy();
    for (const srv of servers.splice(0)) await srv.stop();
  });

  it('two clients see each other’s edits in both directions', async () => {
    const s = await seed();
    const srv = await server();
    const a = await join(srv.url, s, 'owner');
    const b = await join(srv.url, s, 'member');

    shapes(a).set('from-a', 'rectangle');
    await waitFor(() => shapes(b).get('from-a') === 'rectangle', { what: 'A → B' });
    shapes(b).set('from-b', 'ellipse');
    await waitFor(() => shapes(a).get('from-b') === 'ellipse', { what: 'B → A' });

    // Concurrent text edits merge rather than one overwriting the other.
    a.doc.getText('title').insert(0, 'Hello');
    b.doc.getText('title').insert(0, 'World');
    await waitFor(
      () =>
        a.doc.getText('title').length === 10 &&
        a.doc.getText('title').toString() === b.doc.getText('title').toString(),
      { what: 'text converged' },
    );
  });

  it('an edit made while one client is offline is kept and delivered when it reconnects', async () => {
    const s = await seed();
    const srv = await server();
    const a = await join(srv.url, s, 'owner');
    const b = await join(srv.url, s, 'member');

    b.socket.disconnect();
    await waitFor(() => srv.server.hocuspocus.getConnectionsCount() === 1, {
      what: 'B offline',
    });

    shapes(b).set('offline-b', 'drawn on a train');
    shapes(a).set('online-a', 'drawn meanwhile');
    await sleep(300);
    // B's edit has gone nowhere while it is offline.
    expect(shapes(a).has('offline-b')).toBe(false);

    b.socket.connect();
    await waitFor(() => shapes(a).get('offline-b') === 'drawn on a train', {
      what: 'offline edit at A',
    });
    await waitFor(() => shapes(b).get('online-a') === 'drawn meanwhile', {
      what: 'missed edit at B',
    });
    await waitFor(async () => (await storedDoc(s.boardId)).doc.getMap('shapes').size === 2, {
      what: 'both edits stored',
    });
  });

  it('edits made on both sides while the server is down survive its restart', async () => {
    const s = await seed();
    const first = await server();
    const a = await join(first.url, s, 'owner');
    const b = await join(first.url, s, 'member');
    shapes(a).set('before', 1);
    await waitFor(() => shapes(b).has('before'), { what: 'initial sync' });

    await first.stop();
    for (let i = 0; i < 10; i++) {
      shapes(a).set(`a-${i}`, i);
      shapes(b).set(`b-${i}`, i);
    }
    await sleep(300);

    // Back on the same port, as a restarted process would be. The providers
    // were never told to stop, so they reconnect on their own.
    const second = await server({ env: { PORT_WS: first.wsPort } });
    await waitFor(() => shapes(a).size === 21 && shapes(b).size === 21, {
      what: 'both clients converged',
      timeout: 15_000,
    });
    expect(shapes(a).toJSON()).toEqual(shapes(b).toJSON());
    await waitFor(async () => (await storedDoc(s.boardId)).doc.getMap('shapes').size === 21, {
      what: 'all 21 stored',
    });
    expect(second.log.entries.filter((e) => e.msg === 'authenticated')).toHaveLength(2);
  });
});
