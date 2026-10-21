import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  LOCAL_HISTORY_LIMIT,
  chatsOf,
  loadHistory,
  previousVersion,
  readHistory,
  withChats,
  withEntry,
  writeHistory,
  type DiagramEntry,
} from './diagram-history';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const entry = (id: string, extra: Partial<DiagramEntry> = {}): DiagramEntry => ({
  id,
  description: `diagram ${id}`,
  lines: ['{"t":"meta","direction":"TB"}'],
  createdAt: 1,
  ...extra,
});

describe('diagram history', () => {
  it('keeps each board’s diagrams apart', () => {
    const store = memoryStorage();
    writeHistory('board-a', [entry('1')], store);
    writeHistory('board-b', [entry('2'), entry('3', { changeOf: '2' })], store);
    expect(readHistory('board-a', store).map((e) => e.id)).toEqual(['1']);
    expect(readHistory('board-b', store).map((e) => e.id)).toEqual(['2', '3']);
  });

  it('keeps the newest hundred', () => {
    let list: DiagramEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) list = withEntry(list, entry(String(i)));
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0]!.id).toBe('3');
    expect(list.at(-1)!.id).toBe(String(HISTORY_LIMIT + 2));
  });

  it('keeps the newest ten in local storage, where IndexedDB is not to be had', async () => {
    const store = memoryStorage();
    const list = Array.from({ length: 14 }, (_, i) => entry(String(i)));
    writeHistory('board', list, store);
    expect(readHistory('board', store)).toHaveLength(LOCAL_HISTORY_LIMIT);
    // No IndexedDB in this environment: the list comes from local storage.
    expect((await loadHistory('board', store)).map((e) => e.id)[0]).toBe('4');
  });

  it('puts a refine in the chat of what it changed, and a first request in its own', () => {
    const list = withChats([
      entry('a'),
      entry('b', { changeOf: 'a' }),
      entry('c'),
      entry('d', { changeOf: 'b' }),
      entry('e', { chatId: 'c' }),
    ]);
    expect(list.map((e) => e.chatId)).toEqual(['a', 'a', 'c', 'a', 'c']);
  });

  it('lists the chat that moved last first, titled by its first request', () => {
    const chats = chatsOf(
      withChats([
        entry('a', { createdAt: 1 }),
        entry('b', { createdAt: 2 }),
        entry('c', { createdAt: 3, changeOf: 'a', description: 'make it wider' }),
      ]),
    );
    expect(chats.map((chat) => chat.id)).toEqual(['a', 'b']);
    expect(chats[0]!.title).toBe('diagram a');
    expect(chats[0]!.entries.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('sets a version against what it changed, or the one before it in its chat', () => {
    const list = withChats([
      entry('a'),
      entry('b', { chatId: 'a' }),
      entry('c', { changeOf: 'a' }),
    ]);
    expect(previousVersion(list[1]!, list)?.id).toBe('a');
    expect(previousVersion(list[2]!, list)?.id).toBe('a');
    expect(previousVersion(list[0]!, list)).toBeUndefined();
  });

  it('reads nothing, rather than failing, from storage it did not write', () => {
    const store = memoryStorage();
    store.setItem('cf.diagrams.x', 'not json');
    expect(readHistory('x', store)).toEqual([]);
    store.setItem('cf.diagrams.y', JSON.stringify([entry('ok'), { id: 7 }, 'nope']));
    expect(readHistory('y', store).map((e) => e.id)).toEqual(['ok']);
    expect(readHistory('z', null)).toEqual([]);
  });
});
