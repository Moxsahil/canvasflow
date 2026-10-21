import { describe, expect, it } from 'vitest';
import { LineSplitter } from './diagram-client';

describe('LineSplitter', () => {
  it('holds a half-written line until the rest of it arrives', () => {
    const splitter = new LineSplitter();
    expect(splitter.push('{"t":"node","id":"a"')).toEqual([]);
    expect(splitter.push(',"kind":"rectangle","text":"A"}\n{"t":"edge"')).toEqual([
      '{"t":"node","id":"a","kind":"rectangle","text":"A"}',
    ]);
    expect(splitter.push(',"from":"a","to":"b"}\n')).toEqual(['{"t":"edge","from":"a","to":"b"}']);
  });

  it('skips blank lines and gives back a last line with no newline after it', () => {
    const splitter = new LineSplitter();
    expect(splitter.push('one\n\n  \ntwo')).toEqual(['one']);
    expect(splitter.flush()).toEqual(['two']);
    expect(splitter.flush()).toEqual([]);
  });
});
