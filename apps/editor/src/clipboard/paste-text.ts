/**
 * Writing copied from somewhere else, made ready to stand on the board as a
 * text shape.
 *
 * A text shape has no width of its own: it is as wide as its longest line,
 * and breaks only where its text does. So a paragraph copied off a page, which
 * arrives as one line however long, has to be given its line breaks here or it
 * runs off the side of the view.
 */

/** The widest pasted text is let run, in pixels of the screen it lands on. */
const WIDEST = 920;
/** And the narrowest it is wrapped to, however small the view. */
const NARROWEST = 200;
/** How much of the view's width a pasted paragraph may take up. */
const SHARE_OF_VIEW = 0.9;

/**
 * Clipboard text as a shape's text, or empty when there is nothing in it.
 *
 * Line endings are made the one kind the renderer splits on, and tabs become
 * spaces, since a canvas draws a tab as nothing much. Space at the end of a
 * line and blank lines around the whole are dropped — they are invisible, and
 * would only push the text off the spot it was aimed at. Indentation is kept:
 * in copied code it is part of what was copied.
 */
export function pastedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
}

/**
 * How wide pasted text may run before it is wrapped, in world units.
 *
 * Most of the view, up to a comfortable measure for reading. `scale` is the
 * one the new shape is stamped with, which is what turns the two limits from
 * pixels on screen into the units the text is measured in.
 */
export function pastedTextWidth(viewWidth: number, zoom: number, scale: number): number {
  const inView = (viewWidth * SHARE_OF_VIEW) / zoom;
  return Math.max(NARROWEST * scale, Math.min(WIDEST * scale, inView));
}

/**
 * The same text with every line that runs past `maxWidth` broken between
 * words.
 *
 * Lines that fit are left exactly as they are, so text that was already laid
 * out — a list, a snippet of code — keeps its shape. A single word wider than
 * the limit stays whole on a line of its own: a link cut in two is no longer
 * a link.
 */
export function wrappedToWidth(
  text: string,
  maxWidth: number,
  measure: (line: string) => number,
): string {
  return text
    .split('\n')
    .flatMap((line) => wrappedLine(line, maxWidth, measure))
    .join('\n');
}

function wrappedLine(line: string, maxWidth: number, measure: (line: string) => number): string[] {
  if (measure(line) <= maxWidth) return [line];

  const indent = /^ */.exec(line)?.[0] ?? '';
  const words = line.trim().split(/ +/);

  const lines: string[] = [];
  let current = indent + (words[0] ?? '');
  for (const word of words.slice(1)) {
    const longer = `${current} ${word}`;
    if (measure(longer) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = longer;
    }
  }
  lines.push(current);
  return lines;
}
