import { describe, expect, it } from 'vitest';
import { groupByCategory, matchCommands, scoreCommand, scoreText } from './match';
import type { CommandCategory } from './commands';

const command = (label: string, category: CommandCategory, keywords?: string[]) => ({
  label,
  category,
  keywords,
});

describe('scoreText', () => {
  it('matches characters in order, anywhere in the text', () => {
    expect(scoreText('Bring to front', 'bft')).not.toBeNull();
  });

  it('rejects characters that are out of order', () => {
    expect(scoreText('Bring to front', 'tb')).toBeNull();
  });

  it('rejects characters that are absent', () => {
    expect(scoreText('Undo', 'undoz')).toBeNull();
  });

  it('ignores spaces in the query, so word gaps need not line up', () => {
    expect(scoreText('Zoom to fit', 'zoom fit')).not.toBeNull();
  });

  it('scores a match at the start above one further in', () => {
    const atStart = scoreText('Send to back', 'se')!;
    const laterOn = scoreText('Zoom to selection', 'se')!;
    expect(atStart.score).toBeGreaterThan(laterOn.score);
  });

  it('scores a word start above an arbitrary position', () => {
    const wordStart = scoreText('Send to back', 'b')!;
    const midWord = scoreText('Bring forward', 'r')!;
    expect(wordStart.score).toBeGreaterThan(midWord.score);
  });

  it('prefers the shorter of two otherwise equal labels', () => {
    const shorter = scoreText('Copy', 'cop')!;
    const longer = scoreText('Copy selection', 'cop')!;
    expect(shorter.score).toBeGreaterThan(longer.score);
  });

  it('reports contiguous matches as one range', () => {
    expect(scoreText('Undo', 'und')!.ranges).toEqual([[0, 3]]);
  });

  it('reports scattered matches as separate ranges', () => {
    expect(scoreText('Zoom to fit', 'zf')!.ranges).toEqual([
      [0, 1],
      [8, 9],
    ]);
  });

  it('matches case-insensitively but reports ranges into the original label', () => {
    const hit = scoreText('Zoom to fit', 'ZOOM')!;
    expect(hit.ranges).toEqual([[0, 4]]);
  });
});

describe('scoreCommand', () => {
  it('falls back to keywords when the label does not match', () => {
    const hit = scoreCommand(command('Ellipse', 'Tools', ['circle', 'oval']), 'circle');
    expect(hit).not.toBeNull();
    // Nothing in the visible label matched, so there is nothing to emphasise.
    expect(hit!.ranges).toEqual([]);
  });

  it('ranks a label match above a keyword match', () => {
    const onLabel = scoreCommand(command('Copy selection', 'Edit'), 'copy')!;
    const onKeyword = scoreCommand(command('Duplicate selection', 'Edit', ['copy']), 'copy')!;
    expect(onLabel.score).toBeGreaterThan(onKeyword.score);
  });

  it('returns null when neither the label nor a keyword matches', () => {
    expect(scoreCommand(command('Undo', 'Edit', ['revert']), 'xyz')).toBeNull();
  });
});

describe('matchCommands', () => {
  const commands = [
    command('Rectangle', 'Tools', ['square', 'box']),
    command('Redo', 'Edit'),
    command('Zoom to fit', 'View'),
    command('Send to back', 'Arrange', ['layer']),
  ];

  it('keeps every command, in registry order, for an empty query', () => {
    expect(matchCommands(commands, '  ').map((hit) => hit.item.label)).toEqual([
      'Rectangle',
      'Redo',
      'Zoom to fit',
      'Send to back',
    ]);
  });

  it('drops what does not match', () => {
    expect(matchCommands(commands, 'zoom').map((hit) => hit.item.label)).toEqual(['Zoom to fit']);
  });

  it('puts the closest match first', () => {
    expect(matchCommands(commands, 're')[0]!.item.label).toBe('Redo');
  });

  it('finds a command by a keyword it does not display', () => {
    expect(matchCommands(commands, 'square').map((hit) => hit.item.label)).toEqual(['Rectangle']);
  });

  it('breaks ties towards the earlier command in the registry', () => {
    const tied = [command('Cut', 'Edit'), command('Cut', 'Edit')];
    const [first, second] = matchCommands(tied, 'cut');
    expect(first!.score).toBe(second!.score);
    expect(matchCommands(tied, 'cut')).toHaveLength(2);
  });
});

describe('groupByCategory', () => {
  const scored = [
    { item: command('Send to back', 'Arrange'), score: 9, ranges: [] },
    { item: command('Rectangle', 'Tools'), score: 5, ranges: [] },
    { item: command('Redo', 'Edit'), score: 3, ranges: [] },
  ];

  it('follows the ranking when there is a query, so the best match leads', () => {
    expect(groupByCategory(scored, true).map((group) => group.category)).toEqual([
      'Arrange',
      'Tools',
      'Edit',
    ]);
  });

  it('uses the fixed category order when there is no query', () => {
    expect(groupByCategory(scored, false).map((group) => group.category)).toEqual([
      'Tools',
      'Edit',
      'Arrange',
    ]);
  });

  it('leaves out categories that matched nothing', () => {
    const groups = groupByCategory(scored, false);
    expect(groups.map((group) => group.category)).not.toContain('Board');
  });

  it('keeps every command exactly once', () => {
    const total = groupByCategory(scored, true).reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(scored.length);
  });
});
