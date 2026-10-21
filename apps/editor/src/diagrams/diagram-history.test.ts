import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  readHistory,
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

  it('keeps the newest ten', () => {
    let list: DiagramEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) list = withEntry(list, entry(String(i)));
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0]!.id).toBe('3');
    expect(list.at(-1)!.id).toBe(String(HISTORY_LIMIT + 2));
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
