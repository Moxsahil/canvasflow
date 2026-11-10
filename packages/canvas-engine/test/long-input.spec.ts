import { describe, expect, it } from 'vitest';
import {
  looksLikeOutline,
  mindMapLineOf,
  parseMindMapLine,
  parseOutline,
} from '../src/mindmap/outline.js';
import { parseEmbedInput } from '../src/shapes/embed.js';
import { parseLinkInput } from '../src/shapes/link.js';

/**
 * Pasted and AI-written text is read by hand-written checks here, not by the
 * patterns they replaced: each of those took quadratic time on one shape of
 * long input (seconds for a few tens of thousands of characters). These pin
 * both halves: the answers for ordinary input stay what they were, and the
 * worst input for each old pattern now comes back at once.
 */

const LONG = 100_000;

/** Runs `read` and fails when it takes longer than a linear scan ever should. */
function quickly<T>(read: () => T): T {
  const started = performance.now();
  const result = read();
  expect(performance.now() - started).toBeLessThan(250);
  return result;
}

describe('embed input', () => {
  it('reads the src out of embed code, whatever comes before it', () => {
    expect(
      parseEmbedInput(
        '<iframe title="x" data-src="https://example.com" src=\'https://youtu.be/dQw4w9WgXcQ\'></iframe>',
      ),
    ).toBe('https://youtu.be/dQw4w9WgXcQ');
    // `data-src` alone is not the address, as before.
    expect(parseEmbedInput('<iframe data-src="https://youtu.be/dQw4w9WgXcQ"></iframe>')).toBeNull();
  });

  it('still treats host:port as an address and other schemes as refusals', () => {
    expect(parseEmbedInput('youtu.be:443/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(parseEmbedInput('data:text/html,hi')).toBeNull();
    expect(parseEmbedInput('.youtu.be:443/x')).toBeNull();
  });

  it('answers at once for a tag full of repeated attributes', () => {
    expect(quickly(() => parseEmbedInput(`<iframe${' src="!"'.repeat(LONG / 8)}`))).toBeNull();
  });

  it('answers at once for a long run of dotted digits', () => {
    expect(quickly(() => parseEmbedInput(`9.${'9.'.repeat(LONG / 2)}`))).toBeNull();
  });
});

describe('link input', () => {
  it('reads a bare email as mailto, and only a plain one', () => {
    expect(parseLinkInput('a.b@mail.example.org')).toEqual({
      ok: true,
      link: 'mailto:a.b@mail.example.org',
    });
    // No dot with something either side of it after the @.
    expect(parseLinkInput('pat@example.')).not.toEqual({ ok: true, link: 'mailto:pat@example.' });
    expect(parseLinkInput('pat@.com')).not.toEqual({ ok: true, link: 'mailto:pat@.com' });
    // Two @ signs are not one address.
    expect(parseLinkInput('a@b@c.com')).not.toEqual({ ok: true, link: 'mailto:a@b@c.com' });
  });

  it('answers at once for an address made of a long run of dots', () => {
    quickly(() => parseLinkInput(`a@a.${'a.'.repeat(LONG / 2)}`));
  });
});

describe('outline text', () => {
  it('reads headings after any run of spaces, as before', () => {
    expect(parseOutline('#    Plan\n  first\n  second')).toEqual([
      {
        text: 'Plan',
        children: [
          { text: 'first', children: [] },
          { text: 'second', children: [] },
        ],
      },
    ]);
  });

  it('answers at once for a heading mark followed by a long run of spaces', () => {
    const text = `#${' '.repeat(LONG)} x \nnext`;
    quickly(() => looksLikeOutline(text));
  });

  it('puts a topic on one line, folding each break and the spaces round it', () => {
    const line = mindMapLineOf(0, '  first \n\n   second\r\n third  ');
    expect(parseMindMapLine(line)).toEqual({ depth: 0, text: 'first second third' });
  });

  it('answers at once for a topic with a long run of spaces and no break', () => {
    const line = mindMapLineOf(0, `${' '.repeat(LONG)}x`);
    expect(quickly(() => parseMindMapLine(line))?.text).toBe('x');
  });
});
