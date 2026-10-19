import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { BoardDocument } from '../src/document/document';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape';
import { bookmarkLayout } from '../src/renderers/draw-bookmark';
import { renderSceneToSvgString } from '../src/renderers/svg-scene';
import { sanitizeShape } from '../src/sanitize/sanitize-shape';
import {
  bookmarkHost,
  createBookmark,
  readBookmarkText,
  readBookmarkUrl,
  readPreviewImageName,
} from '../src/shapes/bookmark';
import { shapeBounds } from '../src/shapes/bounds';
import type { BookmarkShape } from '../src/shapes/shape';

const IMAGE = `${'a'.repeat(64)}.jpg`;

const card = (overrides: Partial<BookmarkShape> = {}): BookmarkShape => ({
  ...createBookmark({
    id: 'b1',
    x: 10,
    y: 20,
    width: 400,
    height: 320,
    url: 'https://example.com/post',
    title: 'A post',
    description: 'What it is about',
    siteName: 'Example',
    image: IMAGE,
    seed: 1,
  }),
  ...overrides,
});

function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

describe('the readers', () => {
  it('open only web pages', () => {
    expect(readBookmarkUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(readBookmarkUrl('mailto:someone@example.com')).toBeNull();
    expect(readBookmarkUrl('javascript:alert(1)')).toBeNull();
    expect(readBookmarkUrl(42)).toBeNull();
  });

  it('take a picture only by the name the preview service gives it', () => {
    expect(readPreviewImageName(IMAGE)).toBe(IMAGE);
    expect(readPreviewImageName('https://evil.example/a.png')).toBeNull();
    expect(readPreviewImageName(`../${IMAGE}`)).toBeNull();
    expect(readPreviewImageName(`${'a'.repeat(64)}.svg`)).toBeNull();
  });

  it('read stored words as one plain line, capped', () => {
    expect(readBookmarkText('  two\nlines\u0000here ', 50)).toBe('two lines here');
    expect(readBookmarkText('x'.repeat(80), 50)).toHaveLength(50);
    expect(readBookmarkText({ toString: () => 'no' }, 50)).toBe('');
  });

  it('name the host without www', () => {
    expect(bookmarkHost('https://www.example.com/a')).toBe('example.com');
  });
});

describe('a link card', () => {
  it('is its box', () => {
    expect(shapeBounds(card())).toEqual({ x: 10, y: 20, width: 400, height: 320 });
  });

  it('crosses the wire with its words and picture', () => {
    expect(yMapToShape(integrate(shapeToYMap(card())))).toMatchObject({
      kind: 'bookmark',
      url: 'https://example.com/post',
      title: 'A post',
      description: 'What it is about',
      siteName: 'Example',
      image: IMAGE,
    });
    expect(yMapToShape(integrate(shapeToYMap(card({ image: null }))))).toMatchObject({
      image: null,
    });
  });

  it('comes in from a file only as a web page, with anything else in it dropped', () => {
    expect(sanitizeShape(card(), () => 'n')).toMatchObject({
      id: 'n',
      kind: 'bookmark',
      image: IMAGE,
    });
    expect(sanitizeShape(card({ url: 'javascript:alert(1)' }), () => 'n')).toBeNull();
    expect(
      sanitizeShape(card({ image: 'https://evil.example/x.png' as string }), () => 'n'),
    ).toMatchObject({ image: null });
  });

  it('learns its page without that being a step to undo', () => {
    const doc = new BoardDocument();
    doc.addShape(card({ title: '', description: '', siteName: '', image: null }));
    doc.breakUndoGroup();
    doc.settleShape('b1', { title: 'Read later' } as Partial<BookmarkShape>);
    expect((doc.getShapes()[0] as BookmarkShape).title).toBe('Read later');
    // The one step there is takes the card away, not its title.
    doc.undo();
    expect(doc.getShapes()).toHaveLength(0);
    expect(doc.canUndo()).toBe(false);
  });
});

describe('a link card drawn', () => {
  it('puts the picture across the top and the words under it', () => {
    const layout = bookmarkLayout(card());
    expect(layout.image).toMatchObject({ name: IMAGE, x: 10, y: 20, width: 400 });
    expect(layout.lines.map((line) => line.role)).toEqual(['title', 'text', 'host']);
    expect(layout.lines.at(-1)?.text).toBe('Example · example.com');
  });

  it('falls back to the host for a card whose page gave no title', () => {
    const layout = bookmarkLayout(card({ title: '', image: null, height: 128 }));
    expect(layout.image).toBeNull();
    expect(layout.lines[0]).toMatchObject({ role: 'title', text: 'example.com' });
  });

  it('exports as a card that links to its page, with no picture it was not given', () => {
    const svg = renderSceneToSvgString([card()]);
    expect(svg).toContain('<a href="https://example.com/post"');
    expect(svg).toContain('>A post</text>');
    expect(svg).not.toContain('<image');
    const withPicture = renderSceneToSvgString([card()], {
      imageDataUrls: new Map([[IMAGE, 'data:image/jpeg;base64,AAAA']]),
    });
    expect(withPicture).toContain('href="data:image/jpeg;base64,AAAA"');
  });
});
