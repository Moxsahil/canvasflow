import { useEffect, useRef } from 'react';
import { clearCanvas, setupCanvas } from '@canvasflow/canvas-engine';
import { useDevicePixelRatio } from '../canvas/hooks/useDevicePixelRatio';
import type { Camera } from '../machine/tool-machine.types';
import type { LaserTrails } from './useLaserTrails';
import './laser.css';

interface LaserLayerProps {
  trails: LaserTrails;
  camera: Camera;
  width: number;
  height: number;
}

/**
 * The canvas laser trails are painted on.
 *
 * Its own element, and its own frame loop, for two reasons.
 *
 * It sits outside `.canvas-stack` because that element carries the dark-mode
 * inversion filter — a red beam inside it would render cyan. The peer cursors
 * are placed the same way, for the same reason.
 *
 * And it animates. Every other canvas here repaints from an effect when its
 * inputs change, which is right for a document that only changes when someone
 * edits it. A fading trail changes on every frame while nothing else does, so
 * driving it through React would re-render the editor — and re-run the scene
 * renderer over every shape — sixty times a second. Instead the loop mutates
 * this canvas directly and stops itself the moment the last trail has faded, so
 * a board with no laser on it costs nothing at all.
 */
export function LaserLayer({ trails, camera, width, height }: LaserLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const devicePixelRatio = useDevicePixelRatio();

  // Read through a ref so the loop below never restarts on a pan or zoom; it
  // just picks up the new camera on its next frame.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    const ctx = setupCanvas(canvas, {
      width,
      height,
      devicePixelRatio,
    }) as CanvasRenderingContext2D;
    let frame: number | null = null;
    /** True once a paint has left something on the canvas that must be cleared. */
    let dirty = false;

    const render = () => {
      frame = null;

      const view = cameraRef.current;
      const working = trails.hasWork();

      if (working || dirty) {
        clearCanvas(ctx, width, height);
        dirty = false;
      }

      if (working) {
        ctx.save();
        ctx.translate(-view.x * view.zoom, -view.y * view.zoom);
        ctx.scale(view.zoom, view.zoom);
        trails.draw(ctx, view.zoom);
        ctx.restore();
        dirty = true;

        // Keep going only while there is something left to fade. This is what
        // makes an idle board cost zero frames rather than one per refresh.
        frame = requestAnimationFrame(render);
      }
    };

    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(render);
    };

    // A stroke starting, or a peer's point arriving, is what restarts the loop.
    const unsubscribe = trails.onActivity(schedule);
    schedule();

    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [trails, width, height, devicePixelRatio]);

  return (
    <canvas
      ref={canvasRef}
      className="cf-laser-layer"
      aria-hidden="true"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
