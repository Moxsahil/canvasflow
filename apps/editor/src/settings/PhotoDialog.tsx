import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorLine, SettingsButton, SettingsModal } from './settings-ui';

/**
 * Choose which part of a photo becomes the avatar: the dialog Upload opens on
 * the Profile page.
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
 * More than twice the largest place one is drawn, so it stays sharp on a dense
 * display without storing a photograph nobody sees.
 */
const OUTPUT = 256;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** JPEG at this quality is visually lossless at avatar sizes and a third the bytes. */
const OUTPUT_QUALITY = 0.9;
const OUTPUT_MIME = 'image/jpeg';

interface PhotoDialogProps {
  /** The picked file. Replaced rather than reopened when another is chosen. */
  file: File;
  busy: boolean;
  /** Why the last upload did not go through, while it is still worth saying. */
  error?: string | null;
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

export function PhotoDialog({ file, busy, error = null, onCancel, onUse }: PhotoDialogProps) {
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
      // A moment later rather than at once: a load still under way — React's
      // development double-mount starts one and drops it straight away — would
      // otherwise fail against an address that is already gone.
      setTimeout(() => URL.revokeObjectURL(src), 1000);
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
    <SettingsModal
      title="Position your photo"
      description="Drag the photo to place it, and zoom until it fills the circle the way you want. The circle is exactly what others will see."
      onClose={onCancel}
      width={400}
      actions={
        <>
          <SettingsButton variant="ghost" onClick={onCancel}>
            Cancel
          </SettingsButton>
          <SettingsButton variant="primary" onClick={handleUse} disabled={!image || busy}>
            {busy ? 'Uploading…' : 'Use photo'}
          </SettingsButton>
        </>
      }
    >
      {failed ? (
        <ErrorLine>That file could not be opened as an image.</ErrorLine>
      ) : (
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ width: VIEWPORT, height: VIEWPORT }}
          className="relative shrink-0 self-center touch-none overflow-hidden rounded-full bg-[var(--surface-wash)] shadow-[0_0_0_1px_var(--surface-border)] [cursor:grab] active:[cursor:grabbing]"
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

      <label className="flex items-center gap-[10px] self-center text-[11.5px] text-[var(--surface-fg-muted)]">
        Zoom
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!image || busy}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="w-[200px] accent-[var(--surface-accent)]"
        />
      </label>

      <ErrorLine>{error}</ErrorLine>
    </SettingsModal>
  );
}
