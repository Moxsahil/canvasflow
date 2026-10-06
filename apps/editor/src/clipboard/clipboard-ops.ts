import { SUPPORTED_IMAGE_MIME_TYPES, type Shape } from '@canvasflow/canvas-engine';
import { isCanvasFlowClipboard, isExcalidrawClipboard, type CanvasFlowClipboard } from './schema';
import { excalidrawElementsToShapes } from './excalidraw-adapter';
import { withFreshIds } from './paste-placement';
import { pastedText } from './paste-text';

/**
 * Image files on the clipboard, as a paste would deliver them.
 *
 * Read before the text path, because a screenshot copied from another app puts
 * an image on the clipboard and nothing our text reader would recognise —
 * checking text first would simply find nothing and drop the paste.
 *
 * Returns empty rather than throwing where `clipboard.read` is unavailable or
 * refused: the text path is still worth trying, and a browser that will not
 * hand over the clipboard is not an error the user can fix.
 */
export async function readImagesFromClipboard(): Promise<File[]> {
  if (typeof navigator.clipboard?.read !== 'function') return [];

  let items: ClipboardItems;
  try {
    items = await navigator.clipboard.read();
  } catch {
    return [];
  }

  const files: File[] = [];
  for (const item of items) {
    const type = item.types.find((candidate) =>
      (SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(candidate),
    );
    if (!type) continue;
    try {
      const blob = await item.getType(type);
      const extension = type.split('/')[1]?.replace('+xml', '') ?? 'png';
      files.push(new File([blob], `pasted-image.${extension}`, { type }));
    } catch {
      // One unreadable item shouldn't discard the rest of the paste.
    }
  }
  return files;
}

/** Shapes in the board's own clipboard format. */
export function clipboardPayload(shapes: readonly Shape[]): CanvasFlowClipboard {
  return { type: 'canvasflow/clipboard', version: 1, shapes: [...shapes] };
}

/**
 * Serialize shapes into our clipboard JSON format and write to system clipboard.
 *
 * Falls back to console.error if the browser blocks clipboard access.
 * Returns true on success, false on failure (silent — no modal).
 */
export async function writeShapesToClipboard(shapes: readonly Shape[]): Promise<boolean> {
  if (shapes.length === 0) return false;

  try {
    await navigator.clipboard.writeText(JSON.stringify(clipboardPayload(shapes)));
    return true;
  } catch (err) {
    console.error('Clipboard write failed:', err);
    return false;
  }
}

/** Whether this browser can put something other than plain text on the clipboard. */
export function canWriteClipboardItems(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
}

/**
 * Put one item on the clipboard, under one type, from data still being made.
 *
 * The item is handed over before anything is awaited. Safari only lets a page
 * write to the clipboard straight after the click or key that asked for it,
 * and a write made after an await is one nobody asked for — given a promise,
 * it waits for the data itself. Firefox has refused a promise in the past
 * instead, so a refused write is tried once more with the data in hand. That
 * second try also surfaces the data's own failure, where it was the data
 * that failed, rather than the clipboard's vaguer complaint about it.
 */
export function writeClipboardItem(type: string, data: Promise<Blob>): Promise<void> {
  if (!canWriteClipboardItems()) {
    return Promise.reject(
      new Error(
        "This browser can't copy images to the clipboard. Firefox needs dom.events.asyncClipboard.clipboardItem enabled.",
      ),
    );
  }
  return navigator.clipboard
    .write([new ClipboardItem({ [type]: data })])
    .catch(async () => navigator.clipboard.write([new ClipboardItem({ [type]: await data })]));
}

/**
 * Put text on the clipboard that is not ready yet: an SVG waiting on the bytes
 * of its images. As an item where the browser takes one, for the reason given
 * at `writeClipboardItem`; written once it is ready where it does not.
 */
export function writeLateTextToClipboard(text: Promise<string>): Promise<void> {
  if (canWriteClipboardItems()) {
    return writeClipboardItem(
      'text/plain',
      text.then((ready) => new Blob([ready], { type: 'text/plain' })),
    );
  }
  return text.then((ready) => navigator.clipboard.writeText(ready));
}

/**
 * What a paste keystroke brought with it, read off its event.
 *
 * Images are every supported picture among its files, which is where a file
 * copied from a folder turns up and nowhere else.
 */
export interface CarriedPaste {
  readonly images: File[];
  readonly text: string;
}

/** What a paste found on the clipboard, once it has been made sense of. */
export type ClipboardContent =
  | { readonly kind: 'shapes'; readonly shapes: Shape[] }
  | { readonly kind: 'svg'; readonly file: File }
  | { readonly kind: 'text'; readonly text: string };

/**
 * A whole SVG document and nothing else, an XML declaration and a doctype
 * allowed ahead of it. Anything around the markup — a sentence, a code fence —
 * makes it writing that happens to mention an SVG.
 */
const SVG_DOCUMENT = /^(?:<\?xml[^>]*\?>\s*)?(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>][\s\S]*<\/svg>$/i;

/**
 * Make sense of the clipboard's text.
 *
 * Shapes where it is a board's own copy, or one from a drawing app whose
 * format is understood. An SVG document is the picture it describes — what
 * Copy as SVG puts on the clipboard, here or anywhere else — and goes on the
 * board as an image. Anything else is what it looks like — writing, to be put
 * on the board as text. Null when there is nothing in it to paste.
 *
 * A copy that is recognised but holds nothing usable is nothing, not text:
 * nobody copying shapes wants their JSON written out on the board instead.
 */
export function clipboardContentFrom(raw: string, genId: () => string): ClipboardContent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON, so not shapes. Most of what is ever copied lands here.
  }

  let shapes: Shape[] | null = null;
  if (isCanvasFlowClipboard(parsed)) {
    // Reassign IDs so pasted shapes never collide with existing ones
    shapes = withFreshIds(parsed.shapes, genId);
  } else if (isExcalidrawClipboard(parsed)) {
    shapes = excalidrawElementsToShapes(parsed.elements, genId);
  }
  if (shapes) return shapes.length > 0 ? { kind: 'shapes', shapes } : null;

  const markup = raw.trim();
  if (SVG_DOCUMENT.test(markup)) {
    const file = new File([markup], 'pasted-image.svg', { type: 'image/svg+xml' });
    return { kind: 'svg', file };
  }

  const text = pastedText(raw);
  return text ? { kind: 'text', text } : null;
}

export async function readClipboardContent(genId: () => string): Promise<ClipboardContent | null> {
  let raw: string;
  try {
    raw = await navigator.clipboard.readText();
  } catch (err) {
    console.error('Clipboard read failed:', err);
    return null;
  }

  return raw ? clipboardContentFrom(raw, genId) : null;
}
