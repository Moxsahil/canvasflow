import { describe, expect, it } from 'vitest';
import { fixingLines, progressOf } from './diagram-progress';

const meta = (direction: string) => JSON.stringify({ t: 'meta', direction });
const node = (text: string) => JSON.stringify({ t: 'node', id: text, kind: 'rectangle', text });
const edge = JSON.stringify({ t: 'edge', from: 'a', to: 'b' });

describe('progressOf', () => {
  it('is reading until the first line arrives', () => {
    expect(progressOf([]).phase).toBe('reading');
  });

  it('follows the lines: layout, then boxes by name, then arrows', () => {
    expect(progressOf([meta('LR')])).toMatchObject({ phase: 'layout', direction: 'LR' });
    expect(progressOf([meta('TB'), node('Start'), node('Build')])).toMatchObject({
      phase: 'boxes',
      boxes: ['Start', 'Build'],
    });
    expect(progressOf([meta('TB'), node('Start'), node('Build'), edge])).toMatchObject({
      phase: 'arrows',
      arrows: 1,
    });
  });

  it('says fixing while the fix-up pass runs, and skips lines that are not JSON', () => {
    expect(progressOf([meta('TB'), 'not json', node('A'), edge], 2)).toMatchObject({
      phase: 'fixing',
      fixing: 2,
      boxes: ['A'],
    });
  });
});

describe('fixingLines', () => {
  it('reads the gateway’s fix-up line and nothing else', () => {
    expect(fixingLines(JSON.stringify({ t: 'status', phase: 'fixing', lines: 3 }))).toBe(3);
    expect(fixingLines(node('A'))).toBeNull();
    expect(fixingLines('{"t":"status"')).toBeNull();
  });
});
