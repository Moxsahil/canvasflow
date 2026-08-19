import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document';
import { createRectangle } from '../src/shapes/rectangle';

const rect = (id: string, x: number) =>
  createRectangle({ id, x, y: 0, width: 10, height: 10, seed: 1 });

/**
 * Simulates what the sync server does with a board: every save is a complete
 * `encodeStateAsUpdate` snapshot, and a load merges the newest few rows back
 * together (see services/sync-server/src/persistence/board-updates-store.ts).
 */
describe('opening a file survives a reload', () => {
  it('reloads the opened file, not a blank board', () => {
    // A board that already has shapes, saved once.
    const server = new BoardDocument();
    server.addShape(rect('a', 0));
    server.addShape(rect('b', 10));
    const snapshotBefore = Y.encodeStateAsUpdate(server.yDoc);

    // A client loads it, then opens a file over the top.
    const client = new BoardDocument();
    Y.applyUpdate(client.yDoc, snapshotBefore, 'provider');
    client.replaceShapes([rect('c', 20)]);

    // The replace reaches the server through the socket, and is saved.
    Y.applyUpdate(server.yDoc, Y.encodeStateAsUpdate(client.yDoc), 'provider');
    const snapshotAfter = Y.encodeStateAsUpdate(server.yDoc);

    // Reload: the server merges its retention window (newest first) and the
    // fresh client applies the result.
    const merged = Y.mergeUpdates([snapshotAfter, snapshotBefore]);
    const reloaded = new BoardDocument();
    Y.applyUpdate(reloaded.yDoc, merged, 'provider');

    expect(reloaded.getShapes().map((s) => s.id)).toEqual(['c']);
  });

  it('reloads correctly when the local cache also replays the replace', () => {
    // The offline cache holds the client's own updates and replays them on
    // reload, before the server's state arrives.
    const server = new BoardDocument();
    server.addShape(rect('a', 0));
    const snapshotBefore = Y.encodeStateAsUpdate(server.yDoc);

    const client = new BoardDocument();
    Y.applyUpdate(client.yDoc, snapshotBefore, 'provider');
    client.replaceShapes([rect('c', 20)]);
    const cached = Y.encodeStateAsUpdate(client.yDoc);

    // Reload: cache first, then the server's older snapshot merges in.
    const reloaded = new BoardDocument();
    Y.applyUpdate(reloaded.yDoc, cached, 'indexeddb');
    Y.applyUpdate(reloaded.yDoc, snapshotBefore, 'provider');

    expect(reloaded.getShapes().map((s) => s.id)).toEqual(['c']);
  });
});
