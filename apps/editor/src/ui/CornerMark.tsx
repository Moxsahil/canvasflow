import { BREAKPOINT, getBreakpoint } from './breakpoints';

/** The logo's tile with its glyph cut out, so the board shows through in either theme. */
const LOGO_PATH =
  'M26 0H94A26 26 0 0 1 120 26V94A26 26 0 0 1 94 120H26A26 26 0 0 1 0 94V26A26 26 0 0 1 26 0Z' +
  'M34.5 34.5H67.5L58.5 44.5H32V73.5H58.5L50 83H34.5A12 12 0 0 1 22.5 71V46.5A12 12 0 0 1 34.5 34.5Z' +
  'M73.5 34.5H98.5V44.5H72.5V54.5H98.5L92.5 64.5H72.5V83H63V46.2Z';

interface CornerMarkProps {
  /** Width of the canvas, so the mark steps aside where the dock would reach it. */
  canvasWidth: number;
}

/**
 * The product's logo and name in the bottom-left corner of the board, level
 * with the dock and the zoom panel. Only a signature: it can't be clicked, and
 * pointer events pass through it to the board underneath.
 *
 * Leaves with the zoom panel on boards too narrow to keep it clear of the dock.
 */
export function CornerMark({ canvasWidth }: CornerMarkProps) {
  if (getBreakpoint(canvasWidth) < BREAKPOINT.TABLET) return null;

  return (
    <div
      data-testid="corner-mark"
      className="pointer-events-none absolute bottom-4 left-4 z-(--zIndex-layerUI) flex h-[38px] items-center gap-2 px-2 text-xs font-semibold text-muted-foreground select-none"
    >
      <svg viewBox="0 0 120 120" className="size-5 shrink-0" aria-hidden="true">
        <path d={LOGO_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
      CanvasFlow
    </div>
  );
}
