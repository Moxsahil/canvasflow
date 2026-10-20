import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { eyedropperCursorValue } from '../canvas/bucket-cursor';
import { isDarkColor, sampleBoardColor } from '../canvas/sample-color';

/** Size of the swatch that follows the pipette, and its gap from the pointer, in pixels. */
const PREVIEW_SIZE = 32;
const PREVIEW_GAP = 12;

interface BucketEyedropperProps {
  /** The canvas the board is drawn on — what the colour is read off. */
  getCanvas: () => HTMLCanvasElement | null;
  /** The board's ground, painted beneath the canvas rather than into it. */
  ground: string;
  darkMode: boolean;
  /** Where the pointer was when Alt went down, so the swatch starts under it. */
  initialPoint: { readonly x: number; readonly y: number } | null;
  /** A colour picked up: the bucket pours it from here on. */
  onPick: (color: string) => void;
  onCancel: () => void;
}

/**
 * The bucket's pipette, up for as long as Alt is held: a click anywhere on the
 * board takes the colour under it as the colour to pour.
 *
 * A layer over the board rather than a mode of the board's own pointer
 * handling, so a press here can never reach the canvas and pour by mistake.
 * A swatch beside the pointer shows what a click would pick up.
 */
export function BucketEyedropper({
  getCanvas,
  ground,
  darkMode,
  initialPoint,
  onPick,
  onCancel,
}: BucketEyedropperProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const colorAt = (clientX: number, clientY: number): string => {
    const canvas = getCanvas();
    return canvas ? sampleBoardColor(canvas, clientX, clientY, ground) : ground;
  };

  /** Move the swatch beside the pointer, to the side with room, and show the colour there. */
  const follow = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const preview = previewRef.current;
    if (!root || !preview) return;
    const box = root.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    const left =
      x + PREVIEW_GAP + PREVIEW_SIZE > box.width ? x - PREVIEW_GAP - PREVIEW_SIZE : x + PREVIEW_GAP;
    const top =
      y + PREVIEW_GAP + PREVIEW_SIZE > box.height
        ? y - PREVIEW_GAP - PREVIEW_SIZE
        : y + PREVIEW_GAP;
    const color = colorAt(clientX, clientY);
    preview.style.transform = `translate(${left}px, ${top}px)`;
    preview.style.background = color;
    preview.style.borderColor = isDarkColor(color) ? '#ffffff' : '#222222';
    preview.style.visibility = 'visible';
  };

  // The latest props for the listeners below, which are set up once.
  const latest = useRef({ follow, onCancel });
  latest.current = { follow, onCancel };

  useLayoutEffect(() => {
    if (initialPoint) latest.current.follow(initialPoint.x, initialPoint.y);
    // Once, as the pipette comes up; every move after is the listener's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => latest.current.follow(event.clientX, event.clientY);
    // Escape puts the pipette away and nothing else: caught before the
    // board's shortcuts hear it, which would put the bucket down too.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.onCancel();
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('keydown', key, true);
    };
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onPick(colorAt(event.clientX, event.clientY));
  };

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      data-testid="bucket-eyedropper"
      className="absolute inset-0 touch-none overflow-hidden"
      style={{ cursor: eyedropperCursorValue(darkMode) }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={previewRef}
        className="pointer-events-none absolute top-0 left-0 rounded-full border shadow-[2px_2px_0_0_rgba(73,73,73,0.5)]"
        style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, visibility: 'hidden' }}
      />
    </div>
  );
}
