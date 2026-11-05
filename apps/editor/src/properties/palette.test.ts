import { describe, expect, it } from 'vitest';
import { NOTE_COLORS } from '@canvasflow/canvas-engine';
import { bucketFillColor, nextBucketColor, NOTE_SWATCHES } from './palette';

describe('bucket colours', () => {
  it('pours green when the shared fill colour is transparent', () => {
    expect(bucketFillColor(null)).toBe('#40c057');
    expect(bucketFillColor('#fab005')).toBe('#fab005');
  });

  it('steps round its swatches, white left out', () => {
    expect(nextBucketColor('#fa5252')).toBe('#40c057');
    expect(nextBucketColor('#40C057')).toBe('#228be6');
    expect(nextBucketColor('#fab005')).toBe('#fa5252');
  });

  it('starts the round at the first swatch from any other colour', () => {
    expect(nextBucketColor('#ffffff')).toBe('#fa5252');
    expect(nextBucketColor('#123456')).toBe('#fa5252');
  });
});

describe('note papers', () => {
  it('offers exactly the papers a note comes in, in the same order', () => {
    expect(NOTE_SWATCHES.map((swatch) => swatch.value)).toEqual([...NOTE_COLORS]);
  });
});
