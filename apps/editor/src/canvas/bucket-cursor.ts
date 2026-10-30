import { BUCKET_ICON_PATHS, EYEDROPPER_ICON_PATHS } from '../assets/icons';

/**
 * The bucket tool's pointers: its toolbar icon, with the falling drop filled in
 * the colour the next click will pour, and the pipette it turns into while Alt
 * is held.
 *
 * Drawn the way the cursors in cursors.css are — a wide halo under the visible
 * stroke, so it reads over a dark shape and a blank board alike — but built
 * here rather than written there, since the drop changes with the colour.
 */

/** Halo and ink for each board, as cursors.css pairs them. */
const INK = {
  light: { halo: '#ffffff', ink: '#09090b' },
  dark: { halo: '#101012', ink: '#fafafa' },
} as const;

/**
 * Where the click lands: the bottom of the drop, so the paint falls on the
 * spot pointed at.
 */
const BUCKET_HOTSPOT = '20 22';

/** The pipette's tip. */
const EYEDROPPER_HOTSPOT = '2 22';

/** `#` has to go: unescaped it opens a URL fragment and the cursor is dropped. */
function encodeSvg(markup: string): string {
  return markup.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23').replace(/"/g, "'");
}

const paths = (ds: readonly string[]) => ds.map((d) => `<path d="${d}"/>`).join('');

/** An SVG cursor value, with the keyword fallback Safari needs. */
function cursorValue(svgBody: string, hotspot: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ` +
    `fill="none" stroke-linecap="round" stroke-linejoin="round">${svgBody}</svg>`;
  // The keyword fallback is not optional: Safari has never supported SVG
  // cursors, and a bare url() there leaves the pointer as `auto`.
  return `url("data:image/svg+xml,${encodeSvg(svg)}") ${hotspot}, crosshair`;
}

/** A `cursor` value for the bucket, its drop painted `color`. */
export function bucketCursorValue(color: string, darkMode: boolean): string {
  const { halo, ink } = darkMode ? INK.dark : INK.light;
  const outline = paths([BUCKET_ICON_PATHS.pot, BUCKET_ICON_PATHS.handle, BUCKET_ICON_PATHS.rim]);
  const drop = paths([BUCKET_ICON_PATHS.drop]);
  return cursorValue(
    `<g stroke="${halo}" stroke-width="3.5">${outline}${drop}</g>` +
      `<g stroke="${ink}" stroke-width="1.5">${outline}</g>` +
      `<g fill="${color}" stroke="${ink}" stroke-width="1.5">${drop}</g>`,
    BUCKET_HOTSPOT,
  );
}

/** A `cursor` value for the pipette the bucket picks colours up with. */
export function eyedropperCursorValue(darkMode: boolean): string {
  const { halo, ink } = darkMode ? INK.dark : INK.light;
  const pipette = paths(EYEDROPPER_ICON_PATHS);
  return cursorValue(
    `<g stroke="${halo}" stroke-width="3.5">${pipette}</g>` +
      `<g stroke="${ink}" stroke-width="1.5">${pipette}</g>`,
    EYEDROPPER_HOTSPOT,
  );
}
