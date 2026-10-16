import { generateKeyBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import { comparePins, liveBoards, pinnedOf } from './useBoardSwitcher';
import type { BoardSummary } from './workspace-api';

const board = (id: string, extra: Partial<BoardSummary> = {}): BoardSummary => ({
  id,
  workspaceId: 'w1',
  title: id,
  visibility: 'workspace',
  color: 'gray',
  updatedAt: '2026-10-07T00:00:00.000Z',
  ownerId: 'me',
  archivedAt: null,
  ...extra,
});

describe('pinnedOf', () => {
  it('lists only pinned boards, by order key, top first', () => {
    const list = [
      board('plain'),
      board('second', { pin: 'a1' }),
      board('first', { pin: 'a0' }),
      board('gone', { pin: 'Zz', archivedAt: '2026-10-10T00:00:00.000Z' }),
    ];
    expect(pinnedOf(list).map((it) => it.id)).toEqual(['first', 'second']);
  });

  it('puts a new pin above the rest, as pinning one does', () => {
    const top = generateKeyBetween(null, 'a0');
    const list = [board('old', { pin: 'a0' }), board('new', { pin: top })];
    expect(pinnedOf(list).map((it) => it.id)).toEqual(['new', 'old']);
  });

  it('compares keys as written, not by locale: "Z" sorts before "a"', () => {
    const list = [board('lower', { pin: 'a0' }), board('upper', { pin: 'Zz' })];
    expect(pinnedOf(list).map((it) => it.id)).toEqual(['upper', 'lower']);
  });

  it('breaks a tie between equal keys by id, so the order holds still', () => {
    expect(comparePins(board('b', { pin: 'a0' }), board('a', { pin: 'a0' }))).toBe(1);
  });
});

describe('liveBoards', () => {
  it('leaves archived boards out, and returns a list with none as it was', () => {
    const live = { status: 'ready' as const, boards: [board('a')] };
    expect(liveBoards(live)).toBe(live);
    const mixed = {
      status: 'ready' as const,
      boards: [board('a'), board('b', { archivedAt: '2026-10-10T00:00:00.000Z' })],
    };
    expect(liveBoards(mixed)).toEqual({ status: 'ready', boards: [board('a')] });
  });
});
