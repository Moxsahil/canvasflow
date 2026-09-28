import { describe, expect, it } from 'vitest';
import { emptyFolder, listFolder, type ObjectStore } from './account-purge.js';

const BOARD = '318a4e6c-bf17-4ec4-a5bd-966fac7a8738';
const OTHER_BOARD = '9b1f0c52-6f7e-4d8a-b1c3-2a4e5f6a7b8c';
const USER = '3ef72266-0242-48aa-a2ad-741a5fd16bf7';

/** A bucket in memory, paging and refusing the way the real one can. */
class MemoryStore implements ObjectStore {
  readonly keys: Set<string>;
  readonly removeCalls: number[] = [];
  /** Keys storage answers "not deleted" for. */
  readonly refuse = new Set<string>();
  /** Accept deletes and do nothing, like a bucket that lies. */
  ignoreDeletes = false;
  /** Answer every listing with every key, like a store that ignores the prefix. */
  ignorePrefix = false;
  listCalls = 0;

  constructor(
    keys: string[],
    private readonly pageSize = 1000,
  ) {
    this.keys = new Set(keys);
  }

  async list(prefix: string, after?: string) {
    this.listCalls += 1;
    const all = [...this.keys].filter((key) => this.ignorePrefix || key.startsWith(prefix)).sort();
    const start = after ? Number(after) : 0;
    const end = start + this.pageSize;
    return { keys: all.slice(start, end), next: end < all.length ? String(end) : undefined };
  }

  async remove(keys: readonly string[]) {
    if (keys.length > 1000) throw new Error('More than a thousand keys in one call');
    this.removeCalls.push(keys.length);
    const refused: { key: string; reason: string }[] = [];
    for (const key of keys) {
      if (this.refuse.has(key)) refused.push({ key, reason: 'AccessDenied: Access Denied' });
      else if (!this.ignoreDeletes) this.keys.delete(key);
    }
    return refused;
  }
}

const folder = `boards/${BOARD}/`;
const files = (n: number) => Array.from({ length: n }, (_, i) => `${folder}${String(i)}.png`);
/** Keys that must survive every test: another board, a photo, and a lookalike. */
const neighbours = [
  `boards/${OTHER_BOARD}/keep.png`,
  `avatars/${USER}/me.webp`,
  `boards/${BOARD}.bak/x`,
];

describe('emptyFolder', () => {
  it('empties a folder of more than a thousand files, a thousand at a time', async () => {
    const store = new MemoryStore([...files(2500), ...neighbours]);
    expect(await emptyFolder(store, folder)).toBe(2500);
    expect(store.removeCalls).toEqual([1000, 1000, 500]);
    expect([...store.keys].sort()).toEqual([...neighbours].sort());
  });

  it('pages through a listing that comes back in pieces', async () => {
    const store = new MemoryStore([...files(7), ...neighbours], 3);
    expect(await listFolder(store, folder)).toHaveLength(7);
  });

  it('is fine with a folder that is already empty', async () => {
    const store = new MemoryStore(neighbours);
    expect(await emptyFolder(store, folder)).toBe(0);
    expect(store.removeCalls).toEqual([]);
  });

  it('fails when storage says a file was not deleted', async () => {
    const store = new MemoryStore(files(3));
    store.refuse.add(`${folder}1.png`);
    await expect(emptyFolder(store, folder)).rejects.toThrow(/refused to delete 1 file/);
  });

  it('fails when files are still there after deleting', async () => {
    const store = new MemoryStore(files(3));
    store.ignoreDeletes = true;
    await expect(emptyFolder(store, folder)).rejects.toThrow(/3 file\(s\) still under/);
  });

  it('deletes only the folder, even from a store that answers with everything', async () => {
    const store = new MemoryStore([...files(2), ...neighbours]);
    store.ignorePrefix = true;
    expect(await emptyFolder(store, folder)).toBe(2);
    expect([...store.keys].sort()).toEqual([...neighbours].sort());
  });

  it('refuses anything but one account’s or one board’s folder, before asking storage', async () => {
    const store = new MemoryStore(neighbours);
    for (const bad of [
      '',
      'boards/',
      'avatars/',
      `boards/${BOARD}`,
      `boards/${BOARD}/x/`,
      `boards/../`,
      `thumbnails/${BOARD}/`,
      `boards/${BOARD}/../`,
    ]) {
      await expect(emptyFolder(store, bad), JSON.stringify(bad)).rejects.toThrow(/Refusing/);
    }
    expect(store.listCalls).toBe(0);
    expect(store.keys.size).toBe(neighbours.length);
  });
});
