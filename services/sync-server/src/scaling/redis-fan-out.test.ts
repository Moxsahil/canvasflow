import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Document, Hocuspocus, onStoreDocumentPayload } from '@hocuspocus/server';
import { RoomSafeRedis, createFanOutExtensions } from './redis-fan-out.js';

describe('createFanOutExtensions', () => {
  it('adds nothing for a single instance', () => {
    expect(createFanOutExtensions(undefined)).toEqual([]);
    expect(createFanOutExtensions('')).toEqual([]);
  });
});

/**
 * The extension's own Redis clients never connect here (lazyConnect), and the
 * server it talks to is a stand-in holding just what the subclass reads.
 */
function setup() {
  const ext = new RoomSafeRedis({ options: { lazyConnect: true }, prefix: 'canvasflow:sync' });
  const documents = new Map<string, Document>();
  const debounced = new Set<string>();
  const unloadDocument = vi.fn(async (doc: Document) => {
    documents.delete(doc.name);
  });
  ext.instance = {
    documents,
    debouncer: { isDebounced: (id: string) => debounced.has(id) },
    unloadDocument,
  } as unknown as Hocuspocus;
  const unsubscribe = vi.fn((_key: string, cb: () => void) => cb());
  (ext as unknown as { sub: { unsubscribe: typeof unsubscribe } }).sub = { unsubscribe };
  // Every save attempt loses the lock, as on the instance that did not win it.
  (ext as unknown as { redlock: { lock: unknown } }).redlock = {
    lock: (_key: string, _ttl: number, cb: (err: Error | null) => void) => cb(new Error('locked')),
  };

  const room = (name: string, connections = 0, isLoading = false) =>
    ({ name, isLoading, getConnectionsCount: () => connections }) as unknown as Document;
  const loseSave = (doc: Document) =>
    ext
      .onStoreDocument({ documentName: doc.name, document: doc } as onStoreDocumentPayload)
      .catch(() => {});
  return { ext, documents, debounced, unloadDocument, unsubscribe, room, loseSave };
}

describe('RoomSafeRedis', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('leaves unloading to the server when the last person leaves', async () => {
    const { ext, documents, unloadDocument, room } = setup();
    documents.set('b', room('b'));
    await ext.onDisconnect({ documentName: 'b' } as never);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(unloadDocument).not.toHaveBeenCalled();
  });

  it('leaves the Redis channel once the room is unloaded', async () => {
    const { ext, unsubscribe } = setup();
    await ext.afterUnloadDocument({ documentName: 'b' } as never);
    expect(unsubscribe).toHaveBeenCalledWith('canvasflow:sync:b', expect.any(Function));
  });

  it('keeps the channel when the board is already loading again', async () => {
    const { ext, documents, unsubscribe, room } = setup();
    documents.set('b', room('b', 0, true));
    await ext.afterUnloadDocument({ documentName: 'b' } as never);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('unloads an idle room whose save went to another instance', async () => {
    const { documents, unloadDocument, room, loseSave } = setup();
    const doc = room('b');
    documents.set('b', doc);
    await loseSave(doc);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(unloadDocument).toHaveBeenCalledWith(doc);
  });

  it('never unloads a newer room that took the same name', async () => {
    const { documents, unloadDocument, room, loseSave } = setup();
    const old = room('b');
    documents.set('b', old);
    await loseSave(old);
    documents.set('b', room('b', 3));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(unloadDocument).not.toHaveBeenCalled();
  });

  it('waits while a save is still pending, then unloads', async () => {
    const { documents, debounced, unloadDocument, room, loseSave } = setup();
    const doc = room('b');
    documents.set('b', doc);
    debounced.add('onStoreDocument-b');
    await loseSave(doc);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(unloadDocument).not.toHaveBeenCalled();
    debounced.delete('onStoreDocument-b');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(unloadDocument).toHaveBeenCalledWith(doc);
  });

  it('leaves a room alone while people are on it', async () => {
    const { documents, unloadDocument, room, loseSave } = setup();
    const doc = room('b', 2);
    documents.set('b', doc);
    await loseSave(doc);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(unloadDocument).not.toHaveBeenCalled();
  });
});
