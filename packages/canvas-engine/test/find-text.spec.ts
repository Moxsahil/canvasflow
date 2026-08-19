import { describe, expect, it } from 'vitest';
import { findTextMatches, matchRects, MAX_TEXT_MATCHES } from '../src/search/find-text';
import { createText } from '../src/shapes/text';
import { createRectangle } from '../src/shapes/rectangle';
import type { TextShape } from '../src/shapes/shape';

const text = (over: Partial<Parameters<typeof createText>[0]> & { text: string }): TextShape =>
  createText({ id: 't', x: 0, y: 0, fontSize: 20, fontFamily: 'sans-serif', ...over });

describe('findTextMatches', () => {
  it('matches a substring regardless of case', () => {
    const { matches } = findTextMatches([text({ text: 'Hello World' })], 'hello');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ index: 0, length: 5 });
  });

  it('finds every occurrence in one shape', () => {
    const { matches } = findTextMatches([text({ text: 'the cat and the hat' })], 'the');
    expect(matches.map((m) => m.index)).toEqual([0, 12]);
  });

  it('does not overlap occurrences', () => {
    // "aaaa" contains "aa" twice, not three times — the same way a regex
    // advancing lastIndex would count it.
    const { matches } = findTextMatches([text({ text: 'aaaa' })], 'aa');
    expect(matches.map((m) => m.index)).toEqual([0, 2]);
  });

  it('treats the query literally, not as a pattern', () => {
    // The reason this uses indexOf rather than RegExp: no escaping to forget.
    const { matches } = findTextMatches([text({ text: 'cost is a+b (roughly)' })], 'a+b');
    expect(matches).toHaveLength(1);
    const dotted = findTextMatches([text({ text: 'axb' })], 'a.b');
    expect(dotted.matches).toHaveLength(0);
  });

  it('ignores shapes that carry no text', () => {
    const rect = createRectangle({ id: 'r', x: 0, y: 0, width: 10, height: 10, seed: 1 });
    expect(findTextMatches([rect], 'anything').matches).toHaveLength(0);
  });

  it('returns nothing for an empty query', () => {
    expect(findTextMatches([text({ text: 'hello' })], '').matches).toHaveLength(0);
  });

  it('orders matches top to bottom, so navigation reads down the board', () => {
    const shapes = [
      text({ id: 'low', y: 500, text: 'find me' }),
      text({ id: 'high', y: 10, text: 'find me' }),
      text({ id: 'mid', y: 100, text: 'find me' }),
    ];
    expect(findTextMatches(shapes, 'find').matches.map((m) => m.shapeId)).toEqual([
      'high',
      'mid',
      'low',
    ]);
  });

  it('caps runaway result sets and says so', () => {
    const many = text({ text: 'a'.repeat(MAX_TEXT_MATCHES + 500) });
    const result = findTextMatches([many], 'a');
    expect(result.matches).toHaveLength(MAX_TEXT_MATCHES);
    expect(result.truncated).toBe(true);
  });

  it('reports truncated: false when everything fits', () => {
    expect(findTextMatches([text({ text: 'one hit' })], 'hit').truncated).toBe(false);
  });
});

describe('matchRects', () => {
  it('offsets the highlight by the width of the text before it', () => {
    const shape = text({ text: 'aaa target', x: 100, y: 50 });
    const [rect] = matchRects(shape, 4, 6);
    expect(rect).toBeDefined();
    // Starts after "aaa " — to the right of the shape's own x.
    expect(rect!.x).toBeGreaterThan(100);
    expect(rect!.y).toBe(50);
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBeCloseTo(24); // fontSize * 1.2
  });

  it('starts flush with the shape when the match is at the beginning', () => {
    const shape = text({ text: 'target here', x: 100, y: 0 });
    const [rect] = matchRects(shape, 0, 6);
    expect(rect!.x).toBe(100);
  });

  it('puts a highlight on the correct line', () => {
    const shape = text({ text: 'first\nsecond\nthird', y: 0 });
    const [rect] = matchRects(shape, 'first\nsecond\n'.length, 5);
    expect(rect!.y).toBeCloseTo(48); // third line: 2 * 24
  });

  it('splits a match that spans a line break into one rect per line', () => {
    const shape = text({ text: 'end\nstart' });
    // "d\ns" — one character on each side of the break.
    const rects = matchRects(shape, 2, 3);
    expect(rects).toHaveLength(2);
    expect(rects[0]!.y).toBeCloseTo(0);
    expect(rects[1]!.y).toBeCloseTo(24);
    // The newline itself gets no rectangle, so the second starts at the margin.
    expect(rects[1]!.x).toBe(shape.x);
  });

  it('shifts the highlight left for centred text', () => {
    const centred = text({ text: 'centred text', textAlign: 'center', x: 200 });
    const left = text({ text: 'centred text', textAlign: 'left', x: 200 });
    expect(matchRects(centred, 0, 7)[0]!.x).toBeLessThan(matchRects(left, 0, 7)[0]!.x);
  });

  it('ends a right-aligned line at the shape origin', () => {
    const shape = text({ text: 'abc', textAlign: 'right', x: 300 });
    const [rect] = matchRects(shape, 0, 3);
    expect(rect!.x + rect!.width).toBeCloseTo(300, 0);
  });

  it('returns nothing for a zero-length match', () => {
    expect(matchRects(text({ text: 'hello' }), 0, 0)).toEqual([]);
  });
});
