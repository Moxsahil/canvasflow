import { useCallback, useEffect, useRef } from 'react';
import { hsvToRgb, type Hsv } from './hsv';

const SIZE = 168;
/** Width of the alpha ramp at the rim, so the disc edge isn't jagged. */
const EDGE_FEATHER = 1.5;

/**
 * Screen angle → hue. Puts hue 0 at 12 o'clock and runs clockwise, which is
 * what the drawing loop below assumes too — both directions share this one
 * definition so the marker can never drift from the pixel under it.
 */
function angleToHue(dx: number, dy: number): number {
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
}

function hueToAngleRad(h: number): number {
  return ((h - 90) * Math.PI) / 180;
}

interface ColorWheelProps {
  value: Hsv;
  /** `transient` is true while dragging, so callers can defer undo bookkeeping. */
  onChange: (hsv: Hsv, transient: boolean) => void;
}

/**
 * Hue/saturation disc. Hue is the angle, saturation the distance from the
 * centre; value is supplied by the caller's slider and shades the whole disc.
 *
 * Painted per-pixel rather than with a CSS conic-gradient so the rendering uses
 * exactly the same maths as the hit-testing, and so hue interpolation doesn't
 * go muddy the way sRGB gradient interpolation does.
 */
export function ColorWheel({ value, onChange }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(SIZE * dpr);
    canvas.width = px;
    canvas.height = px;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const image = ctx.createImageData(px, px);
    const data = image.data;
    const radius = px / 2;

    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++) {
        const dx = x - radius + 0.5;
        const dy = y - radius + 0.5;
        const dist = Math.hypot(dx, dy);
        const i = (y * px + x) * 4;

        if (dist > radius) {
          data[i + 3] = 0;
          continue;
        }

        const { r, g, b } = hsvToRgb({
          h: angleToHue(dx, dy),
          s: Math.min(dist / radius, 1),
          v: value.v,
        });
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        // Feather the last pixel or so of the rim.
        const edge = radius - dist;
        data[i + 3] =
          edge >= EDGE_FEATHER * dpr ? 255 : Math.round((edge / (EDGE_FEATHER * dpr)) * 255);
      }
    }

    ctx.putImageData(image, 0, 0);
  }, [value.v]);

  const pick = useCallback(
    (clientX: number, clientY: number, transient: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const radius = rect.width / 2;
      const dx = clientX - rect.left - radius;
      const dy = clientY - rect.top - radius;

      onChange(
        {
          h: angleToHue(dx, dy),
          // Clamped, so dragging past the rim keeps tracking hue at full saturation.
          s: Math.min(Math.hypot(dx, dy) / radius, 1),
          v: value.v,
        },
        transient,
      );
    },
    [onChange, value.v],
  );

  const markerAngle = hueToAngleRad(value.h);
  const markerRadius = (value.s * SIZE) / 2;

  return (
    <div className="cf-wheel">
      <canvas
        ref={canvasRef}
        className="cf-wheel__canvas"
        style={{ width: SIZE, height: SIZE }}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX, e.clientY, true);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) pick(e.clientX, e.clientY, true);
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
          // Final, non-transient change closes the undo group.
          pick(e.clientX, e.clientY, false);
        }}
      />
      <span
        className="cf-wheel__marker"
        aria-hidden="true"
        style={{
          left: SIZE / 2 + Math.cos(markerAngle) * markerRadius,
          top: SIZE / 2 + Math.sin(markerAngle) * markerRadius,
        }}
      />
    </div>
  );
}
