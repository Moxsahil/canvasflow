import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { shapeToYMap, yMapToShape } from '../src/document/yjs-shape';
import { renderSceneToSvgString } from '../src/renderers/svg-scene';
import { sanitizeShape } from '../src/sanitize/sanitize-shape';
import { createArrow } from '../src/shapes/arrow';
import { MAX_LINK_LENGTH, linkLabel, parseLinkInput, readLink } from '../src/shapes/link';
import { createRectangle } from '../src/shapes/rectangle';
import type { RectangleShape } from '../src/shapes/shape';

const rect = () => createRectangle({ id: 'r1', x: 0, y: 0, width: 100, height: 50, seed: 1 });

/** Typed loosely on purpose: half of these are values no client should write. */
const withLink = (link: unknown) => ({ ...rect(), link }) as RectangleShape;

/** Put a Y.Map into a doc, as it would be when read back off the wire. */
function integrate(map: Y.Map<unknown>): Y.Map<unknown> {
  const doc = new Y.Doc();
  doc.getArray<Y.Map<unknown>>('shapes').push([map]);
  return doc.getArray<Y.Map<unknown>>('shapes').get(0);
}

describe('readLink', () => {
  it('accepts web and mail addresses', () => {
    expect(readLink('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(readLink('http://localhost:3000/')).toBe('http://localhost:3000/');
    expect(readLink('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('refuses anything a browser could run or that reaches the reader’s machine', () => {
    for (const value of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/abc',
    ]) {
      expect(readLink(value)).toBeNull();
    }
  });

  it('refuses what is not a whole address, or not a string at all', () => {
    for (const value of [
      '',
      'example.com',
      'https:',
      'https://',
      ' https://example.com',
      'https://exa mple.com',
      'https://example.com/\n',
      `https://example.com/${'a'.repeat(MAX_LINK_LENGTH)}`,
      null,
      undefined,
      42,
      { href: 'https://example.com' },
    ]) {
      expect(readLink(value)).toBeNull();
    }
  });
});

describe('parseLinkInput', () => {
  it('reads an empty field as taking the link away', () => {
    expect(parseLinkInput('')).toEqual({ ok: true, link: null });
    expect(parseLinkInput('   ')).toEqual({ ok: true, link: null });
  });

  it('keeps a full address, in its canonical form', () => {
    expect(parseLinkInput('  https://Example.com/Path  ')).toEqual({
      ok: true,
      link: 'https://example.com/Path',
    });
    expect(parseLinkInput('http://example.com')).toEqual({
      ok: true,
      link: 'http://example.com/',
    });
  });

  it('gives a bare address https, and a bare email mailto', () => {
    expect(parseLinkInput('example.com/docs')).toEqual({
      ok: true,
      link: 'https://example.com/docs',
    });
    expect(parseLinkInput('localhost:3000')).toEqual({ ok: true, link: 'https://localhost:3000/' });
    expect(parseLinkInput('example.com:8080/x')).toEqual({
      ok: true,
      link: 'https://example.com:8080/x',
    });
    expect(parseLinkInput('someone@example.com')).toEqual({
      ok: true,
      link: 'mailto:someone@example.com',
    });
  });

  it('drops a scheme a paste doubled', () => {
    expect(parseLinkInput('https://https://example.com')).toEqual({
      ok: true,
      link: 'https://example.com/',
    });
    expect(parseLinkInput('http://https://example.com/a')).toEqual({
      ok: true,
      link: 'https://example.com/a',
    });
  });

  it('encodes what a URL cannot hold literally', () => {
    expect(parseLinkInput('example.com/a b')).toEqual({
      ok: true,
      link: 'https://example.com/a%20b',
    });
  });

  it('refuses a stray word, and every other scheme', () => {
    for (const value of [
      'hello',
      'hello world',
      'javascript:alert(1)',
      'javascript:1',
      'data:text/html,hi',
      'file:///etc/passwd',
      'ftp://example.com',
      'http://',
    ]) {
      expect(parseLinkInput(value)).toEqual({ ok: false });
    }
  });

  it('only ever produces what readLink accepts back', () => {
    for (const value of ['example.com', 'someone@example.com', 'https://example.com/ü']) {
      const parsed = parseLinkInput(value);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(readLink(parsed.link)).toBe(parsed.link);
    }
  });
});

describe('linkLabel', () => {
  it('shows the address without its scheme or a bare trailing slash', () => {
    expect(linkLabel('https://example.com/')).toBe('example.com');
    expect(linkLabel('https://example.com/docs?a=1#top')).toBe('example.com/docs?a=1#top');
    expect(linkLabel('mailto:someone@example.com')).toBe('someone@example.com');
  });

  it('decodes a path written in another script', () => {
    expect(linkLabel('https://example.com/%C3%BC')).toBe('example.com/ü');
  });
});

describe('a link on the board', () => {
  it('round-trips through the document', () => {
    const shape = yMapToShape(integrate(shapeToYMap(withLink('https://example.com/'))));
    expect(shape?.link).toBe('https://example.com/');
  });

  it('round-trips on a line-like shape as well as a box', () => {
    const arrow = {
      ...createArrow({
        id: 'a1',
        x: 0,
        y: 0,
        points: [
          [0, 0],
          [10, 10],
        ],
      }),
      link: 'mailto:someone@example.com',
    };
    expect(yMapToShape(integrate(shapeToYMap(arrow)))?.link).toBe('mailto:someone@example.com');
  });

  it('writes no key for a shape without one, so older boards are untouched', () => {
    expect(integrate(shapeToYMap(rect())).has('link')).toBe(false);
    expect(integrate(shapeToYMap(withLink(null))).has('link')).toBe(false);
  });

  it('never writes an address it would refuse to open', () => {
    expect(integrate(shapeToYMap(withLink('javascript:alert(1)'))).has('link')).toBe(false);
  });

  it('reads an address another client wrote and this one refuses as no link', () => {
    const map = integrate(shapeToYMap(rect()));
    map.set('link', 'javascript:alert(1)');
    expect(yMapToShape(map)?.link).toBeUndefined();

    map.set('link', null);
    expect(yMapToShape(map)?.link).toBeUndefined();

    map.set('link', new Y.Text('https://example.com'));
    expect(yMapToShape(map)?.link).toBeUndefined();
  });

  it('survives a board file, and is dropped there when it is not an address', () => {
    const kept = sanitizeShape({ ...withLink('https://example.com/') }, () => 'new');
    expect(kept?.link).toBe('https://example.com/');

    const dropped = sanitizeShape({ ...withLink('javascript:alert(1)') }, () => 'new');
    expect(dropped).not.toBeNull();
    expect(dropped?.link).toBeUndefined();
  });

  it('exports to SVG as a link around the shape', () => {
    const svg = renderSceneToSvgString([withLink('https://example.com/?a=1&b="2"')]);
    expect(svg).toContain(
      '<a href="https://example.com/?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener noreferrer">',
    );
    expect(renderSceneToSvgString([withLink('javascript:alert(1)')])).not.toContain('<a ');
  });
});
