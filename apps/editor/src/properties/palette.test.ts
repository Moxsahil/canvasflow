import { describe, expect, it } from 'vitest';
import { NOTE_COLORS } from '@canvasflow/canvas-engine';
import { bucketFillColor, nextBucketColor, NOTE_SWATCHES } from './palette';

describe('bucket colours', () => {
  it('pours green when the shared fill colour is transparent', () => {
    expect(bucketFillColor(null)).toBe('#b2f2bb');
    expect(bucketFillColor('#ffec99')).toBe('#ffec99');
  });

  it('steps round its swatches, white left out', () => {
    expect(nextBucketColor('#ffc9c9')).toBe('#b2f2bb');
    expect(nextBucketColor('#B2F2BB')).toBe('#a5d8ff');
    expect(nextBucketColor('#ffec99')).toBe('#ffc9c9');
  });

  it('starts the round at the first swatch from any other colour', () => {
    expect(nextBucketColor('#ffffff')).toBe('#ffc9c9');
    expect(nextBucketColor('#123456')).toBe('#ffc9c9');
  });
});

describe('note papers', () => {
  it('offers exactly the papers a note comes in, in the same order', () => {
    expect(NOTE_SWATCHES.map((swatch) => swatch.value)).toEqual([...NOTE_COLORS]);
  });
});
