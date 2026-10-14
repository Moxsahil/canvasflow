import * as Y from 'yjs';

/**
 * A board's saved snapshots as one document, the way the sync-server reads
 * them: each is a whole copy, and merging the few newest can only recover
 * writes, never lose them. Null for a board with nothing saved yet.
 */
export function mergeSnapshots(snapshots: readonly Uint8Array[]): Uint8Array | null {
  if (snapshots.length === 0) return null;
  if (snapshots.length === 1) return snapshots[0]!;
  return Y.mergeUpdates(snapshots.map((snapshot) => new Uint8Array(snapshot)));
}
