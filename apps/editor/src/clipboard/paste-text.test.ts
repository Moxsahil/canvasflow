import { describe, expect, it } from 'vitest';
import { createRectangle } from '@canvasflow/canvas-engine';
import { clipboardContentFrom } from './clipboard-ops';
import { PASTE_HERE_NOTICE, PASTE_NOTICE, isPasteNotice } from './paste-notice';
import { pastedText, pastedTextWidth, wrappedToWidth } from './paste-text';

/** Ten units a character, so a test can say how wide a line is by counting. */
const measure = (line: string) => line.length * 10;

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

describe('clipboardContentFrom', () => {
  it('reads a board’s own copy as shapes, under new ids', () => {
    const raw = JSON.stringify({
      type: 'canvasflow/clipboard',
      version: 1,
      shapes: [createRectangle({ id: 'a', x: 0, y: 0, width: 20, height: 20 })],
    });

    const content = clipboardContentFrom(raw, counter());

    expect(content).toMatchObject({ kind: 'shapes', shapes: [{ id: 'new-1', kind: 'rectangle' }] });
  });

  it('reads another drawing app’s copy as shapes', () => {
    const raw = JSON.stringify({
      type: 'excalidraw/clipboard',
      elements: [{ id: 'e', type: 'rectangle', x: 0, y: 0, width: 40, height: 30 }],
    });

    expect(clipboardContentFrom(raw, counter())).toMatchObject({
      kind: 'shapes',
      shapes: [{ kind: 'rectangle', width: 40 }],
    });
  });

  it('reads anything else as the writing it is', () => {
    expect(clipboardContentFrom('Hello, board', counter())).toEqual({
      kind: 'text',
      text: 'Hello, board',
    });
  });

  it('pastes JSON that is not a copy of shapes as text, exactly as written', () => {
    for (const raw of ['{"name": "Ada"}', '42', '"quoted"', 'null', '[1, 2]']) {
      expect(clipboardContentFrom(raw, counter())).toEqual({ kind: 'text', text: raw });
    }
  });

  it('finds nothing in a copy of shapes with none it can use, rather than writing out its JSON', () => {
    const empty = JSON.stringify({ type: 'canvasflow/clipboard', version: 1, shapes: [] });
    const unknown = JSON.stringify({
      type: 'excalidraw/clipboard',
      elements: [{ id: 'e', type: 'no-such-thing', x: 0, y: 0 }],
    });

    expect(clipboardContentFrom(empty, counter())).toBeNull();
    expect(clipboardContentFrom(unknown, counter())).toBeNull();
  });

  it('finds nothing in space alone', () => {
    expect(clipboardContentFrom('  \n\t \r\n', counter())).toBeNull();
  });
});

describe('pastedText', () => {
  it('makes every kind of line ending the one the renderer splits on', () => {
    expect(pastedText('one\r\ntwo\rthree\nfour')).toBe('one\ntwo\nthree\nfour');
  });

  it('drops the blank lines around the text and the space ending each line', () => {
    expect(pastedText('\n\n  first  \nsecond\t\n\n')).toBe('  first\nsecond');
  });

  it('keeps indentation and the blank lines between paragraphs', () => {
    expect(pastedText('if (x) {\n\treturn;\n}\n\nnext')).toBe('if (x) {\n    return;\n}\n\nnext');
  });
});

describe('wrappedToWidth', () => {
  it('leaves text that fits exactly as it is', () => {
    expect(wrappedToWidth('short line\nand another', 200, measure)).toBe('short line\nand another');
  });

  it('breaks a long line between words, each line as full as the width allows', () => {
    const wrapped = wrappedToWidth('the quick brown fox jumps over the lazy dog', 150, measure);

    expect(wrapped).toBe('the quick brown\nfox jumps over\nthe lazy dog');
    expect(wrapped.split('\n').every((line) => measure(line) <= 150)).toBe(true);
  });

  it('wraps only the lines that need it', () => {
    const wrapped = wrappedToWidth('a list:\n- one two three four five\n- six', 120, measure);

    expect(wrapped).toBe('a list:\n- one two\nthree four\nfive\n- six');
  });

  it('keeps a word wider than the limit whole, on a line of its own', () => {
    const link = 'https://example.com/a/very/long/path';

    expect(wrappedToWidth(`see ${link} for more`, 100, measure)).toBe(`see\n${link}\nfor more`);
  });

  it('keeps the indentation of a line it has to break', () => {
    expect(wrappedToWidth('    indented words here', 140, measure)).toBe(
      '    indented\nwords here',
    );
  });
});

describe('pastedTextWidth', () => {
  it('takes most of the view, up to a comfortable measure', () => {
    expect(pastedTextWidth(800, 1, 1)).toBe(720);
    expect(pastedTextWidth(1600, 1, 1)).toBe(920);
  });

  it('never wraps narrower than a few words, however small the view', () => {
    expect(pastedTextWidth(100, 1, 1)).toBe(200);
  });

  it('comes out the same on screen at any zoom, for text sized to the zoom it is made at', () => {
    // Half the zoom, twice the scale: twice as wide in world units, and the
    // same 920 pixels once the camera has halved it again.
    expect(pastedTextWidth(1600, 0.5, 2)).toBe(1840);
  });

  it('fits the view when text keeps its size and the view is zoomed in', () => {
    expect(pastedTextWidth(1600, 4, 1)).toBe(360);
  });
});

describe('the notices asking for the paste keystroke', () => {
  it('are told apart from every other notice, and from none', () => {
    expect(isPasteNotice(PASTE_NOTICE)).toBe(true);
    expect(isPasteNotice(PASTE_HERE_NOTICE)).toBe(true);
    expect(isPasteNotice({ title: 'Image', body: 'Too large.', tone: 'warn' })).toBe(false);
    expect(isPasteNotice(null)).toBe(false);
  });

  it('say where the keystroke will land, only when there is a where', () => {
    expect(PASTE_HERE_NOTICE.title).toMatch(/to paste here$/);
    expect(PASTE_HERE_NOTICE.body).toMatch(/land where you pointed\.$/);
    expect(PASTE_NOTICE.title).toMatch(/to paste$/);
    expect(PASTE_NOTICE.body).not.toMatch(/pointed/);
  });
});
