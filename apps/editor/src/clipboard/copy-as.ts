import {
  computeBoundingRect,
  isArrow,
  isBookmark,
  isFrame,
  isNote,
  isText,
  isTopic,
  mindMapForest,
  mindMapOutline,
  readBookmarkUrl,
  shapeBounds,
  withMindMapBranches,
  type Shape,
} from '@canvasflow/canvas-engine';
import { withFrameMembers } from '../file/export-image';
import { clipboardPayload } from './clipboard-ops';

/** What Copy as copies, as the note that confirms it names it. */
export type CopySubject = 'selection' | 'frame' | 'board';

/** Nothing selected copies the board; one frame on its own is that frame. */
export function copySubjectFor(selected: readonly Shape[]): CopySubject {
  if (selected.length === 0) return 'board';
  const [only] = selected;
  return selected.length === 1 && only && isFrame(only) ? 'frame' : 'selection';
}

/**
 * The shapes the text, Mermaid and JSON copies read: the selection, frames
 * with everything in them and topics with their branches, or the whole of
 * `shapes` when nothing is selected.
 *
 * A frame selected on its own comes with itself here, unlike in an image of
 * it: its name heads a subgraph and its record is part of the data.
 */
export function copyDataFor(
  shapes: readonly Shape[],
  selected: readonly Shape[],
): readonly Shape[] {
  if (selected.length === 0) return shapes;
  const branches = new Set(
    withMindMapBranches(
      selected.map((shape) => shape.id),
      shapes,
    ),
  );
  return withFrameMembers(
    shapes.filter((shape) => branches.has(shape.id)),
    shapes,
  );
}

/** The words a shape carries: a text's, a topic's or a note's own, an arrow's label. Frame names are chrome. */
function wordsOf(shape: Shape): string {
  if (isText(shape) || isTopic(shape) || isNote(shape)) return shape.text.trim();
  if (isArrow(shape)) return shape.label.trim();
  // A link card's words are its title and the page it opens.
  if (isBookmark(shape)) {
    return [shape.title.trim(), readBookmarkUrl(shape.url) ?? ''].filter(Boolean).join('\n');
  }
  return '';
}

/** Whether there are any words among `shapes` for Copy as text to copy. */
export function hasWords(shapes: readonly Shape[]): boolean {
  return shapes.some((shape) => wordsOf(shape) !== '');
}

interface Placed {
  readonly words: string;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * The words among `shapes`, in the order a reader would take them, a blank
 * line between one shape's and the next's.
 *
 * Read in lines, top to bottom and left to right within a line, rather than
 * in the order the shapes were drawn: a heading added last still comes first.
 * A line is everything whose middle falls level with the first shape on it,
 * so boxes in a row that are not quite aligned still read across.
 */
export function copyTextOf(shapes: readonly Shape[]): string {
  const placed: Placed[] = [];
  // A mind map reads as one indented list, standing where the map does —
  // what pastes into notes as the outline it is, and back onto a board as
  // the same map.
  const topics = shapes.filter(isTopic);
  for (const root of mindMapForest(topics).roots) {
    const map = new Set(withMindMapBranches([root.id], topics));
    const members = topics.filter((topic) => map.has(topic.id));
    const bounds = computeBoundingRect(members);
    if (!bounds) continue;
    placed.push({
      words: mindMapOutline(members),
      top: bounds.y,
      bottom: bounds.y + bounds.height,
      left: bounds.x,
    });
  }
  for (const shape of shapes) {
    if (isTopic(shape)) continue;
    const words = wordsOf(shape);
    if (words === '') continue;
    const bounds = shapeBounds(shape);
    placed.push({ words, top: bounds.y, bottom: bounds.y + bounds.height, left: bounds.x });
  }
  placed.sort((a, b) => a.top - b.top || a.left - b.left);

  const lines: Placed[][] = [];
  for (const item of placed) {
    const line = lines.at(-1);
    const first = line?.[0];
    if (line && first && (item.top + item.bottom) / 2 < first.bottom) line.push(item);
    else lines.push([item]);
  }

  return lines
    .flatMap((line) => line.sort((a, b) => a.left - b.left))
    .map((item) => item.words)
    .join('\n\n');
}

/**
 * The shapes as the board's own clipboard JSON, laid out to be read.
 *
 * The very format Copy writes, so a paste of it back onto a board gives the
 * shapes again rather than their text.
 */
export function copyJsonOf(shapes: readonly Shape[]): string {
  return JSON.stringify(clipboardPayload(shapes), null, 2);
}
