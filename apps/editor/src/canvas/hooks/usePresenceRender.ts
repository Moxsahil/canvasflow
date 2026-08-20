import { useEffect, useRef, type RefObject } from 'react';
import {
  renderPresenceScene,
  setupCanvas,
  type Peer,
  type PresenceTheme,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { Camera } from '../../machine/tool-machine.types';

interface UsePresenceRenderOptions {
  width: number;
  height: number;
  camera: Camera;
  devicePixelRatio: number;
  theme: PresenceTheme;
  shapes: readonly Shape[];
  peersRef: React.MutableRefObject<readonly Peer[]>;
  /** Fires when `peersRef` changes; see useCollabPresence. */
  subscribe: (listener: () => void) => () => void;
}

/**
 * Paints the collaborator layer.
 *
 * Unlike the other render hooks, this one does not take its data through props.
 * Peer state changes at pointer rate, and a prop would mean a React render per
 * remote mouse move — for every collaborator, forever. Instead the hook reads a
 * ref and repaints on a frame scheduled by a subscription.
 *
 * The frame is scheduled, not continuous: an idle board with three people
 * sitting still should cost nothing, so there is no always-on rAF loop.
 */
export function usePresenceRender(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UsePresenceRenderOptions,
): void {
  const { width, height, camera, devicePixelRatio, theme, shapes, peersRef, subscribe } = options;

  const frameRef = useRef<number | null>(null);

  // Mirrored into a ref so the subscription effect below doesn't tear down and
  // re-subscribe every time the camera moves.
  const paintArgsRef = useRef({ width, height, camera, devicePixelRatio, theme, shapes });
  paintArgsRef.current = { width, height, camera, devicePixelRatio, theme, shapes };

  const paintRef = useRef<() => void>(() => {});

  paintRef.current = () => {
    const canvas = canvasRef.current;
    const args = paintArgsRef.current;
    if (!canvas || args.width === 0 || args.height === 0) return;

    const ctx = setupCanvas(canvas, {
      width: args.width,
      height: args.height,
      devicePixelRatio: args.devicePixelRatio,
    });

    renderPresenceScene(ctx, {
      width: args.width,
      height: args.height,
      camera: args.camera,
      theme: args.theme,
      peers: peersRef.current,
      shapes: args.shapes,
    });
  };

  const schedule = useRef(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paintRef.current();
    });
  }).current;

  // Repaint when the view itself changes: panning or zooming moves every
  // cursor on screen even though no peer has sent anything.
  useEffect(() => {
    schedule();
  }, [schedule, width, height, camera, devicePixelRatio, theme, shapes]);

  useEffect(() => subscribe(schedule), [subscribe, schedule]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );
}
