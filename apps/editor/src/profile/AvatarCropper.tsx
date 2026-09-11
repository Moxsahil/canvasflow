import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Choose which part of a photo becomes the avatar.
 *
 * The picture is dragged and zoomed under a fixed circular window rather than a
 * box being dragged over the picture. It is the same gesture either way, but
 * this way the window is always exactly what gets stored, so there is nothing
 * to reconcile between what was shown and what was cut.
 *
 * The preview and the output are the same arithmetic at two sizes: the image is
 * laid out at `drawWidth × drawHeight` offset by `x, y` within a square, and the
 * canvas repeats that multiplied by one ratio. Nothing is measured from the DOM,
 * so a zoomed browser or a scrollbar cannot move the crop.
 */

/** The window on screen. The stored square is smaller; both are square. */
const VIEWPORT = 260;

/**
 * What gets stored, in pixels.
 *
 * Twice the largest place one is drawn — the 52px row in this dialog — so it
 * stays sharp on a dense display without storing a photograph nobody sees.
 */
const OUTPUT = 256;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** JPEG at this quality is visually lossless at avatar sizes and a third the bytes. */
const OUTPUT_QUALITY = 0.9;
const OUTPUT_MIME = 'image/jpeg';

interface AvatarCropperProps {
  /** The picked file. Replaced rather than reopened when another is chosen. */
  file: File;
  busy: boolean;
  onCancel: () => void;
  onUse: (blob: Blob, mimeType: string) => void;
}

interface Layout {
  /** Displayed size of the whole image, at the current zoom. */
  drawWidth: number;
  drawHeight: number;
  /** Top-left of the image relative to the window. Always zero or negative. */
  x: number;
  y: number;
}

export function AvatarCropper({ file, busy, onCancel, onUse }: AvatarCropperProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  /**
   * Decode the file once, and keep its blob URL for as long as it is on screen.
   *
   * The decoded element is what the canvas draws from, and the same URL is what
   * the preview element loads — so it is revoked on the way out rather than at
   * load, which would leave the preview pointing at nothing.
   */
  useEffect(() => {
    const src = URL.createObjectURL(file);
    const element = new Image();

    element.onload = () => {
      setImage(element);
      setFailed(false);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    element.onerror = () => setFailed(true);
    element.src = src;

    return () => {
      element.onload = null;
      element.onerror = null;
      setImage(null);
      URL.revokeObjectURL(src);
    };
  }, [file]);

  /**
   * Where the image sits, given the zoom and how far it has been dragged.
   *
   * The base scale makes the shorter side exactly fill the window, so zoom 1 is
   * the most of the picture that can be shown without a gap at an edge. The
   * offsets are clamped to the same rule, which is what stops the circle ever
   * showing background.
   */
  const layout = useCallback(
    (candidate: { x: number; y: number }): Layout => {
      if (!image) return { drawWidth: VIEWPORT, drawHeight: VIEWPORT, x: 0, y: 0 };

      const base = VIEWPORT / Math.min(image.naturalWidth, image.naturalHeight);
      const drawWidth = image.naturalWidth * base * zoom;
      const drawHeight = image.naturalHeight * base * zoom;

      return {
        drawWidth,
        drawHeight,
        x: Math.min(0, Math.max(VIEWPORT - drawWidth, candidate.x)),
        y: Math.min(0, Math.max(VIEWPORT - drawHeight, candidate.y)),
      };
    },
    [image, zoom],
  );

  const placed = layout(offset);

  // Re-clamped whenever the zoom changes: zooming out can leave the image
  // narrower than the window it was dragged inside.
  useEffect(() => {
    setOffset((current) => {
      const next = layout(current);
      return next.x === current.x && next.y === current.y ? current : { x: next.x, y: next.y };
    });
  }, [layout]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!image || busy) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX - placed.x,
      startY: event.clientY - placed.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({ x: event.clientX - drag.startX, y: event.clientY - drag.startY });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleUse = () => {
    if (!image) return;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // JPEG has no transparency, so a PNG with a clear background would
    // otherwise come out black rather than blank.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    ctx.imageSmoothingQuality = 'high';

    // The one ratio between what was on screen and what is stored.
    const k = OUTPUT / VIEWPORT;
    ctx.drawImage(image, placed.x * k, placed.y * k, placed.drawWidth * k, placed.drawHeight * k);

    canvas.toBlob(
      (blob) => {
        if (blob) onUse(blob, OUTPUT_MIME);
      },
      OUTPUT_MIME,
      OUTPUT_QUALITY,
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Position your photo"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[18px] bg-[var(--surface-backdrop)] p-[24px]"
    >
      <p className="text-[12.5px] font-medium text-[var(--surface-fg)]">
        Drag to position, and zoom to fit
      </p>

      {failed ? (
        <p className="text-[12px] text-[var(--surface-danger)]">
          That file could not be opened as an image.
        </p>
      ) : (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ width: VIEWPORT, height: VIEWPORT }}
          className="relative shrink-0 touch-none overflow-hidden rounded-full border border-[var(--surface-border)] bg-[var(--surface-card)] [cursor:grab] active:[cursor:grabbing]"
        >
          {image && (
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: placed.drawWidth,
                height: placed.drawHeight,
                transform: `translate(${placed.x}px, ${placed.y}px)`,
              }}
              className="max-w-none origin-top-left select-none"
            />
          )}
        </div>
      )}

      <input
        type="range"
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        aria-label="Zoom"
        disabled={!image || busy}
        onChange={(event) => setZoom(Number(event.target.value))}
        className="w-[260px] accent-[var(--surface-accent)]"
      />

      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          onClick={onCancel}
          className="flex shrink-0 items-center rounded-[7px] px-[14px] py-[8px] text-[12px] font-medium text-[var(--surface-fg-faint)] transition-colors hover:text-[var(--surface-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUse}
          disabled={!image || busy}
          className="flex shrink-0 items-center rounded-[7px] bg-[var(--surface-accent)] px-[14px] py-[8px] text-[12px] font-medium text-[var(--surface-on-accent)] transition-colors hover:bg-[var(--surface-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-fg)] disabled:opacity-60"
        >
          {busy ? 'Uploading…' : 'Use photo'}
        </button>
      </div>
    </div>
  );
}
