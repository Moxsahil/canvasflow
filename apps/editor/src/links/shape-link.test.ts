import { describe, expect, it, vi } from 'vitest';
import { MAX_LINK_LENGTH, createRectangle, type Shape } from '@canvasflow/canvas-engine';
import {
  describeLink,
  followLinkClick,
  isLinkToThisBoard,
  readShapeLink,
  shapeLinkComplete,
  shapeLinkFor,
  shapeLinkRect,
  withoutShapeLink,
} from './shape-link';

const BOARD = 'https://editor.example.com/boards/b1';
const box = (id: string, x: number, y: number): Shape =>
  createRectangle({ id, x, y, width: 100, height: 50 });

describe('shapeLinkFor', () => {
  it('names the shapes on the board’s own address', () => {
    expect(shapeLinkFor(BOARD, [box('shape-a', 0, 0), box('shape-b', 0, 0)])).toBe(
      `${BOARD}?shapes=shape-a.shape-b`,
    );
  });

  it('replaces the place an address already pointed at, and drops its fragment', () => {
    const opened = `${BOARD}?shapes=old&area=1.2.3.4#x`;
    expect(shapeLinkFor(opened, [box('new', 0, 0)])).toBe(`${BOARD}?shapes=new`);
  });

  it('keeps an id with a dot in it whole', () => {
    const link = shapeLinkFor(BOARD, [box('a.b', 0, 0), box('c', 0, 0)]);
    expect(readShapeLink(link)).toEqual({ kind: 'shapes', ids: ['a.b', 'c'] });
  });

  it('links a selection too big to name by the area it covers', () => {
    const many = Array.from({ length: 200 }, (_, i) => box(`shape-${i}-xxxxxxxxxxxx`, i * 10, 5));
    const link = shapeLinkFor(BOARD, many);
    expect(link.length).toBeLessThanOrEqual(MAX_LINK_LENGTH);
    expect(readShapeLink(link)).toEqual({
      kind: 'area',
      rect: { x: 0, y: 5, width: 2090, height: 50 },
    });
  });
});

describe('readShapeLink', () => {
  it('reads both forms back', () => {
    expect(readShapeLink(`${BOARD}?shapes=a.b`)).toEqual({ kind: 'shapes', ids: ['a', 'b'] });
    expect(readShapeLink(`${BOARD}?area=-10.20.300.40`)).toEqual({
      kind: 'area',
      rect: { x: -10, y: 20, width: 300, height: 40 },
    });
  });

  it('finds no place in a plain board address, or a broken one', () => {
    expect(readShapeLink(BOARD)).toBeNull();
    expect(readShapeLink(`${BOARD}?shapes=`)).toBeNull();
    expect(readShapeLink(`${BOARD}?area=1.2.x.4`)).toBeNull();
    expect(readShapeLink(`${BOARD}?area=1.2.-3.4`)).toBeNull();
    expect(readShapeLink('not a url')).toBeNull();
  });
});

describe('where a link lands', () => {
  const shapes = [box('a', 0, 0), box('b', 200, 100)];

  it('frames the shapes it names that are still there', () => {
    expect(shapeLinkRect({ kind: 'shapes', ids: ['a', 'b'] }, shapes)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 150,
    });
    expect(shapeLinkRect({ kind: 'shapes', ids: ['b', 'gone'] }, shapes)).toEqual({
      x: 200,
      y: 100,
      width: 100,
      height: 50,
    });
  });

  it('has nowhere to go when every shape it named is gone', () => {
    expect(shapeLinkRect({ kind: 'shapes', ids: ['gone'] }, shapes)).toBeNull();
  });

  it('knows when every shape it names has arrived', () => {
    expect(shapeLinkComplete({ kind: 'shapes', ids: ['a', 'b'] }, shapes)).toBe(true);
    expect(shapeLinkComplete({ kind: 'shapes', ids: ['a', 'later'] }, shapes)).toBe(false);
    const area = { kind: 'area', rect: { x: 0, y: 0, width: 1, height: 1 } } as const;
    expect(shapeLinkComplete(area, [])).toBe(true);
  });
});

describe('links to this board', () => {
  it('tells a place on this board from one on another, or from the board itself', () => {
    expect(isLinkToThisBoard(`${BOARD}?shapes=a`, BOARD)).toBe(true);
    expect(isLinkToThisBoard(`${BOARD}?shapes=a`, `${BOARD}?shapes=b`)).toBe(true);
    expect(isLinkToThisBoard('https://editor.example.com/boards/b2?shapes=a', BOARD)).toBe(false);
    expect(isLinkToThisBoard('https://other.example.com/boards/b1?shapes=a', BOARD)).toBe(false);
    expect(isLinkToThisBoard(BOARD, BOARD)).toBe(false);
  });

  it('reads as the shapes it points at rather than as an address', () => {
    expect(describeLink(`${BOARD}?shapes=a`, BOARD)).toEqual({
      label: '1 shape on this board',
      onThisBoard: true,
    });
    expect(describeLink(`${BOARD}?shapes=a.b.c`, BOARD).label).toBe('3 shapes on this board');
    expect(describeLink(`${BOARD}?area=0.0.10.10`, BOARD).label).toBe('An area of this board');
    expect(describeLink('https://example.com/docs', BOARD)).toEqual({
      label: 'example.com/docs',
      onThisBoard: false,
    });
  });

  it('strips the place back off to leave the board’s address', () => {
    expect(withoutShapeLink(`${BOARD}?shapes=a&keep=1#frag`).href).toBe(`${BOARD}?keep=1`);
  });
});

describe('followLinkClick', () => {
  const click = (overrides: Partial<Parameters<typeof followLinkClick>[0]> = {}) => ({
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  });

  it('stops the browser only when the board takes the link', () => {
    const taken = click();
    followLinkClick(taken, 'x', () => true);
    expect(taken.preventDefault).toHaveBeenCalledOnce();

    const left = click();
    followLinkClick(left, 'x', () => false);
    expect(left.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves a click meant for a new tab or window to the browser', () => {
    const follow = vi.fn(() => true);
    for (const overrides of [
      { button: 1 },
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
    ]) {
      const event = click(overrides);
      followLinkClick(event, 'x', follow);
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(follow).not.toHaveBeenCalled();
  });
});
