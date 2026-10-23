import { describe, expect, it } from 'vitest';
import { parseOutline, type TopicShape } from '@canvasflow/canvas-engine';
import { DEFAULT_ITEM_STYLE } from '../machine/tool-machine.types';
import { mindMapFromOutline } from './mind-map-ops';

const ids = () => {
  let n = 0;
  return () => `t${n++}`;
};
const shape = (topics: TopicShape[]) =>
  topics.map((t) => [
    t.text,
    t.parentId === null ? null : topics.find((p) => p.id === t.parentId)?.text,
  ]);

describe('a map from an outline', () => {
  it('makes the one top line the centre', () => {
    const topics = mindMapFromOutline(
      parseOutline('Trip\n  Flights\n  Hotels')!,
      { x: 0, y: 0 },
      DEFAULT_ITEM_STYLE,
      1,
      'Mind map',
      ids(),
    );
    expect(shape(topics)).toEqual([
      ['Trip', null],
      ['Flights', 'Trip'],
      ['Hotels', 'Trip'],
    ]);
  });

  it('puts several top lines under a centre of their own', () => {
    const topics = mindMapFromOutline(
      parseOutline('Flights\nHotels\n  Tokyo')!,
      { x: 0, y: 0 },
      DEFAULT_ITEM_STYLE,
      1,
      'Mind map',
      ids(),
    );
    expect(shape(topics)).toEqual([
      ['Mind map', null],
      ['Flights', 'Mind map'],
      ['Hotels', 'Mind map'],
      ['Tokyo', 'Hotels'],
    ]);
  });
});
