import { useEffect, useMemo, useRef, useState } from 'react';
import {
  computeBoundingRect,
  renderSceneToCanvas,
  type DiagramStyle,
} from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { composeDiagram, type ComposedDiagram } from './diagram-kit';

const previewId = (() => {
  let n = 0;
  return () => `preview-${n++}`;
})();

/** World units of margin the renderer leaves around a diagram. */
const PADDING = 16;
/** The tallest a preview gets before it shrinks the diagram instead. */
const MAX_HEIGHT = 320;
const MIN_HEIGHT = 120;
/**
 * The smallest a diagram is drawn at. Below this its labels cannot be read, so
 * a long left-to-right diagram scrolls sideways in its card rather than
 * shrinking into a line.
 */
const MIN_SCALE = 0.42;
/** How far past life size a diagram grows when it has a whole stage to itself. */
const MAX_FILL_SCALE = 1;
const THUMB_HEIGHT = 112;

/**
 * The latest lines, composed one at a time: while one layout is running, lines
 * that arrive only mark it stale, and the newest set is laid out when it ends.
 * A stream of a hundred lines then costs a handful of layouts, not a hundred.
 */
function useComposed(
  lines: readonly string[],
  drawStyle: DiagramStyle | undefined,
): ComposedDiagram | null {
  const [composed, setComposed] = useState<ComposedDiagram | null>(null);
  const latest = useRef({ lines, drawStyle });
  latest.current = { lines, drawStyle };
  const running = useRef(false);
  const stale = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (running.current) {
      stale.current = true;
      return;
    }
    const run = async () => {
      running.current = true;
      try {
        do {
          stale.current = false;
          const next = await composeDiagram(latest.current.lines, previewId, {
            style: latest.current.drawStyle,
          });
          if (!alive.current) return;
          setComposed(next);
        } while (stale.current);
      } catch {
        // Nothing drawable yet; the next line will have something.
      } finally {
        running.current = false;
      }
    };
    void run();
  }, [lines, drawStyle]);

  return composed;
}

/**
 * A diagram's lines drawn the way the board will draw them.
 *
 * The same layout and renderer as the board, so what is inserted is exactly
 * what was shown. Redrawn as lines arrive, which is what makes the preview
 * fill in box by box while the diagram is still being written.
 */
export function DiagramPreview({
  lines,
  dark,
  label,
  drawStyle,
  fit: mode,
}: {
  lines: readonly string[];
  dark: boolean;
  label: string;
  drawStyle?: DiagramStyle;
  /**
   * `fill` takes all the room its parent has and sizes the diagram to it, a
   * little over life size at most; `thumb` is a small picture that never scrolls.
   */
  fit?: 'fill' | 'thumb';
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [room, setRoom] = useState(280);
  const [roomHeight, setRoomHeight] = useState(MAX_HEIGHT);
  const composed = useComposed(lines, drawStyle);
  const shapes = useMemo(() => composed?.shapes ?? [], [composed]);
  const bounds = useMemo(() => computeBoundingRect(shapes), [shapes]);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      setRoom(Math.max(element.clientWidth - 16, 80));
      setRoomHeight(Math.max(element.clientHeight - 16, 80));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = bounds ? bounds.width + PADDING * 2 : 0;
  const height = bounds ? bounds.height + PADDING * 2 : 0;
  const scale = (() => {
    if (width <= 0) return 1;
    if (mode === 'fill') return Math.min(room / width, roomHeight / height, MAX_FILL_SCALE);
    if (mode === 'thumb') return Math.min(room / width, THUMB_HEIGHT / height, 1);
    const fit = Math.min(room / width, MAX_HEIGHT / height, 1);
    return Math.max(fit, Math.min(MIN_SCALE, MAX_HEIGHT / height));
  })();

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    if (shapes.length === 0) {
      element.width = 1;
      element.height = 1;
      return;
    }
    try {
      renderSceneToCanvas(element, shapes, {
        scale: scale * Math.min(window.devicePixelRatio || 1, 2),
        padding: PADDING,
        darkMode: dark,
        backgroundColor: null,
        images: composed?.images,
      });
    } catch {
      // A diagram with nothing drawable yet; the next line will have something.
    }
  }, [shapes, composed, dark, scale]);

  return (
    <div
      ref={frame}
      className={cn(
        'flex w-full items-center p-2',
        mode ? 'overflow-hidden' : 'overflow-x-auto overflow-y-hidden',
        mode === 'fill' && 'h-full',
      )}
      style={
        mode === 'fill'
          ? undefined
          : {
              height:
                mode === 'thumb'
                  ? THUMB_HEIGHT + 16
                  : Math.max(Math.min(height * scale, MAX_HEIGHT), MIN_HEIGHT) + 16,
            }
      }
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        // `m-auto` centres it while it fits, and lets it start at the left
        // edge, scrollable, once it does not.
        className="m-auto shrink-0"
        style={width > 0 ? { width: width * scale, height: height * scale } : undefined}
      />
    </div>
  );
}
