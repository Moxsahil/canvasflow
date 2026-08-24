/**
 * Your own pointer, drawn as the same arrow collaborators see for you.
 *
 * The peer cursors are React (see collab/PeerCursor), but your own pointer has
 * to be a real CSS cursor — an element chasing the mouse trails it by a frame,
 * which you would feel on every stroke. So the same artwork is emitted twice:
 * as JSX there, and as a data URI here.
 */

/** The path from the Cursor primitive, so both pointers are one shape. */
const POINTER_PATH =
  'M19.438 6.716 1.115.05A.832.832 0 0 0 .05 1.116L6.712 19.45a.834.834 0 0 0 1.557.025l3.198-8 7.995-3.2a.833.833 0 0 0 0-1.559h-.024Z';

/** Matches the primitive's `size-3.5`, so your arrow is the size theirs is. */
const POINTER_SIZE = 14;

/**
 * `#` has to go: unescaped it opens a URL fragment, and the browser silently
 * falls back to the keyword cursor rather than reporting a broken image.
 */
function encodeSvg(markup: string): string {
  return markup.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');
}

/**
 * A `cursor` value drawing the pointer in `color`.
 *
 * The hotspot is 0 0: the path's tip sits in the very corner of its viewBox,
 * which is what makes the arrow point at the pixel it selects.
 */
export function pointerCursorValue(color: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${POINTER_SIZE}' height='${POINTER_SIZE}' ` +
    `viewBox='0 0 20 20'><path d='${POINTER_PATH}' fill='${color}'/></svg>`;

  // The keyword fallback is not optional: Safari has never supported SVG
  // cursors, and a bare url() there leaves the pointer as `auto`.
  return `url("data:image/svg+xml,${encodeSvg(svg)}") 0 0, default`;
}
