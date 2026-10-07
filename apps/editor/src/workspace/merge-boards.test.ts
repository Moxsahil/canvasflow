import { describe, expect, it } from 'vitest';
import { mergeBoards } from './merge-boards';
import type { BoardSummary } from './workspace-api';

const board = (id: string, title = id): BoardSummary => ({
  id,
  workspaceId: 'w1',
  title,
  visibility: 'workspace',
  color: 'gray',
  updatedAt: '2026-10-07T00:00:00.000Z',
});

const ids = (list: BoardSummary[]) => list.map((it) => it.id);

describe('mergeBoards', () => {
  it('keeps a renamed board where it was, with its new name', () => {
    const shown = [board('a'), board('b'), board('c')];
    // The server lists the renamed board first, as it was just updated.
    const merged = mergeBoards(shown, [board('b', 'Roadmap'), board('a'), board('c')]);
    expect(ids(merged)).toEqual(['a', 'b', 'c']);
    expect(merged[1]?.title).toBe('Roadmap');
  });

  it('puts new boards at the top, in the order the server gives them', () => {
    const merged = mergeBoards(
      [board('a'), board('b')],
      [board('d'), board('c'), board('a'), board('b')],
    );
    expect(ids(merged)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('drops boards that are gone', () => {
    expect(
      ids(mergeBoards([board('a'), board('b'), board('c')], [board('c'), board('a')])),
    ).toEqual(['a', 'c']);
  });

  it('takes the server list as it is when nothing was shown', () => {
    expect(ids(mergeBoards([], [board('b'), board('a')]))).toEqual(['b', 'a']);
  });
});
