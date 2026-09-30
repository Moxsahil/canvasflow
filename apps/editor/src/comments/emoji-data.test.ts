import { describe, expect, it } from 'vitest';
import { EMOJI_GROUPS, searchEmoji } from './emoji-data';

describe('the emoji the picker offers', () => {
  it('are all emoji, each with a name, and none twice in a group', () => {
    for (const group of EMOJI_GROUPS) {
      const chars = group.emoji.map(([char]) => char);
      expect(new Set(chars).size, group.label).toBe(chars.length);
      for (const [char, name] of group.emoji) {
        expect(char).toMatch(/\p{Extended_Pictographic}/u);
        expect(name.trim()).not.toBe('');
      }
    }
  });

  it('are a chosen set: more than a hundred, and well short of all of them', () => {
    const all = EMOJI_GROUPS.flatMap((group) => group.emoji);
    expect(all.length).toBeGreaterThan(100);
    expect(all.length).toBeLessThan(400);
  });
});

describe('searchEmoji', () => {
  const found = (query: string) =>
    searchEmoji(query).flatMap((group) => group.emoji.map(([c]) => c));

  it('gives every group back for nothing typed', () => {
    expect(searchEmoji('  ')).toBe(EMOJI_GROUPS);
  });

  it('finds by name and by the other words an emoji goes by', () => {
    expect(found('rocket')).toEqual(['🚀']);
    expect(found('launch')).toEqual(['🚀']);
    expect(found('Thumbs UP')).toEqual(['👍']);
  });

  it('lists an emoji once though it is in two groups', () => {
    expect(found('party popper')).toEqual(['🎉']);
  });

  it('gives nothing for a name no emoji has', () => {
    expect(searchEmoji('zzzzqq')).toEqual([]);
  });
});
