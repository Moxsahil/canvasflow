import { afterEach, describe, expect, it } from 'vitest';
import {
  connect,
  mintToken,
  rowCount,
  seed,
  sleep,
  startServer,
  storedDoc,
  waitFor,
  type Client,
  type RunningServer,
  type Seed,
} from './testing/harness.js';

/** Yjs state reaching Postgres through each of the paths that write it. */
describe('persistence', () => {
  const servers: RunningServer[] = [];
  const clients: Client[] = [];

  async function server(options: Parameters<typeof startServer>[0] = {}) {
    const srv = await startServer(options);
    servers.push(srv);
    return srv;
  }
  async function join(srv: RunningServer, s: Seed) {
    const token = await mintToken({
      userId: s.owner.userId,
      sessionId: s.owner.sessionId,
      boardId: s.boardId,
      workspaceId: s.workspaceId,
    });
    const client = connect(srv.url, s.boardId, token);
    clients.push(client);
    await client.ready;
    return client;
  }
  const persisted = (srv: RunningServer, boardId: string) =>
    srv.log.entries.filter(
      (e) => e.msg === 'persisted document state' && e.meta.boardId === boardId,
    );

  afterEach(async () => {
    for (const c of clients.splice(0)) c.destroy();
    for (const srv of servers.splice(0)) await srv.stop();
  });

  it('debounce path: saves edits while the editor stays connected, once per burst', async () => {
    const s = await seed();
    const srv = await server({ debounce: 300, maxDebounce: 5_000 });
    const client = await join(srv, s);

    for (let i = 0; i < 20; i++) {
      client.doc.getMap('shapes').set(`rect-${i}`, i);
      await sleep(10);
    }
    // Inside the debounce window nothing has been written yet.
    expect(await rowCount(s.boardId)).toBe(0);

    await waitFor(() => persisted(srv, s.boardId).length > 0, { what: 'debounced save' });
    const { doc } = await storedDoc(s.boardId);
    expect(doc.getMap('shapes').size).toBe(20);
    // Twenty edits, one write, and the room is still open for the editor.
    await sleep(500);
    expect(persisted(srv, s.boardId)).toHaveLength(1);
    expect(srv.server.hocuspocus.documents.has(s.boardId)).toBe(true);
  });

  it('maxDebounce caps how long a steady stream of edits can go unsaved', async () => {
    const s = await seed();
    const srv = await server({ debounce: 400, maxDebounce: 800 });
    const client = await join(srv, s);

    // An edit every 100 ms never lets the 400 ms debounce settle.
    const started = Date.now();
    let i = 0;
    while (persisted(srv, s.boardId).length === 0 && Date.now() - started < 5_000) {
      client.doc.getMap('shapes').set(`rect-${i++}`, i);
      await sleep(100);
    }
    expect(persisted(srv, s.boardId).length).toBeGreaterThan(0);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('disconnect path: the last editor leaving still saves, then frees the room', async () => {
    const s = await seed();
    const srv = await server({ debounce: 500, maxDebounce: 2_000 });
    const client = await join(srv, s);

    client.doc.getMap('shapes').set('left-behind', 'drawn just before closing the tab');
    await sleep(50);
    client.destroy();

    await waitFor(() => persisted(srv, s.boardId).length > 0, { what: 'save after disconnect' });
    const { doc } = await storedDoc(s.boardId);
    expect(doc.getMap('shapes').get('left-behind')).toBe('drawn just before closing the tab');
    // Saved, and nobody is connected, so the document leaves memory.
    await waitFor(() => !srv.server.hocuspocus.documents.has(s.boardId), {
      what: 'room unloaded',
    });
  });

  it('does not rewrite a document that has not changed since it was loaded', async () => {
    const s = await seed();
    const first = await server({ debounce: 100, maxDebounce: 500 });
    const a = await join(first, s);
    a.doc.getMap('shapes').set('rect', 1);
    await waitFor(() => persisted(first, s.boardId).length > 0, { what: 'first save' });
    a.destroy();
    await first.stop();

    const second = await server({ debounce: 100, maxDebounce: 500 });
    const b = await join(second, s);
    // A change that leaves the state as it was: same key, same value.
    b.doc.getMap('shapes').set('rect', 1);
    await sleep(800);
    expect(persisted(second, s.boardId)).toHaveLength(1);
    // A real change is still written.
    b.doc.getMap('shapes').set('rect', 2);
    await waitFor(() => persisted(second, s.boardId).length > 1, { what: 'second save' });
  });

  it('a graceful shutdown saves edits still waiting on the production debounce', async () => {
    const s = await seed();
    // Production timings (10 s / 30 s): the edit below is nowhere near due.
    const srv = await server({ debounce: undefined, maxDebounce: undefined });
    const client = await join(srv, s);
    client.doc.getMap('shapes').set('pending', 'not yet saved');
    await sleep(100);
    expect(await rowCount(s.boardId)).toBe(0);

    await srv.stop();
    const { doc } = await storedDoc(s.boardId);
    expect(doc.getMap('shapes').get('pending')).toBe('not yet saved');
  }, 40_000);

  it('state survives a server restart and loads into a fresh client', async () => {
    const s = await seed();
    const first = await server();
    const writer = await join(first, s);
    writer.doc.getMap('shapes').set('a', 1);
    writer.doc.getArray('order').push(['a', 'b', 'c']);
    writer.doc.getText('title').insert(0, 'Roadmap');
    await waitFor(() => persisted(first, s.boardId).length > 0, { what: 'save' });
    writer.destroy();
    await first.stop();

    const second = await server();
    const reader = await join(second, s);
    expect(reader.doc.getMap('shapes').toJSON()).toEqual({ a: 1 });
    expect(reader.doc.getArray('order').toJSON()).toEqual(['a', 'b', 'c']);
    expect(reader.doc.getText('title').toString()).toBe('Roadmap');
    expect(second.log.entries.some((e) => e.msg === 'fetch: loaded prior state')).toBe(true);
  });

  it('keeps only the newest three snapshots however often a board is saved', async () => {
    const s = await seed();
    const srv = await server({ debounce: 50, maxDebounce: 200 });
    const client = await join(srv, s);
    for (let i = 0; i < 6; i++) {
      client.doc.getMap('shapes').set(`rect-${i}`, i);
      await waitFor(() => persisted(srv, s.boardId).length > i, { what: `save ${i}` });
    }
    expect(await rowCount(s.boardId)).toBe(3);
    const { doc } = await storedDoc(s.boardId);
    expect(doc.getMap('shapes').size).toBe(6);
  });
});
