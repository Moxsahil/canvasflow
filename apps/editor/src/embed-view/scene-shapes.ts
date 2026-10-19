import * as Y from 'yjs';
import {
  BoardDocument,
  isBookmark,
  isEmbed,
  readBookmarkUrl,
  readLink,
  type Shape,
} from '@canvasflow/canvas-engine';

/**
 * An embedded board's shapes, read back from the plain copies the gateway
 * sends.
 *
 * They go through a document of their own, the way the editor reads every
 * shape it is sent, so a value the editor would refuse or repair is refused
 * or repaired here too, and the shapes come out in the board's own order.
 */
export function sceneShapes(stored: unknown): Shape[] {
  if (!Array.isArray(stored)) return [];
  const doc = new Y.Doc();
  try {
    const maps = stored
      .filter((item): item is Record<string, unknown> => {
        return typeof item === 'object' && item !== null && !Array.isArray(item);
      })
      .map((item) => {
        const map = new Y.Map<unknown>();
        for (const [key, value] of Object.entries(item)) map.set(key, value);
        return map;
      });
    doc.getArray<Y.Map<unknown>>('shapes').push(maps);
    return new BoardDocument(doc).getShapes();
  } finally {
    doc.destroy();
  }
}

/**
 * The page a click on a shape opens, if any: a link card's or an embed's own
 * page, or the link set on the shape — each read through the same allowlist
 * the editor opens links by.
 */
export function shapeLink(shape: Shape): string | null {
  if (isBookmark(shape) || isEmbed(shape)) return readBookmarkUrl(shape.url);
  return readLink(shape.link);
}
