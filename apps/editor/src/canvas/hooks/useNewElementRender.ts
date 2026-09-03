import { useEffect, type RefObject } from 'react';
import {
  isPeerFresh,
  renderNewElementScene,
  setupCanvas,
  type Peer,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { Camera } from '@/machine/tool-machine.types';

interface UseNewElementRenderOptions {
  width: number;
  height: number;
  newElement: Shape | null;
  camera: Camera;
  devicePixelRatio: number;
  /**
   * Collaborators, read through a ref rather than passed as values.
   *
   * Their drafts change at the rate the other person's pointer moves, so
   * taking them as props would re-render this subtree tens of times a second
   * for something only a canvas ever sees. The subscription below redraws
   * without React being involved at all.
   */
  peersRef?: RefObject<readonly Peer[]>;
  subscribePeers?: (listener: () => void) => () => void;
}

/** Whose draft is worth drawing: present, not stale, not walked away from. */
function draftsFrom(peers: readonly Peer[]): Shape[] {
  const now = Date.now();
  const out: Shape[] = [];
  for (const peer of peers) {
    if (!peer.draft || peer.activity === 'away' || !isPeerFresh(peer, now)) continue;
    out.push(peer.draft);
  }
  return out;
}

export function useNewElementRender(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseNewElementRenderOptions,
): void {
  const { width, height, newElement, camera, devicePixelRatio, peersRef, subscribePeers } = options;

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || width === 0 || height === 0) return;

      const ctx = setupCanvas(canvas, { width, height, devicePixelRatio });
      renderNewElementScene(ctx, canvas, {
        width,
        height,
        newElement,
        peerDrafts: draftsFrom(peersRef?.current ?? []),
        camera,
      });
    };

    draw();
    // Redraws on any presence change, which includes plain cursor movement.
    // That is more often than a draft actually changes, but the work is one
    // clear and at most a few shapes — cheaper than tracking what changed.
    return subscribePeers?.(draw);
  }, [canvasRef, width, height, newElement, camera, devicePixelRatio, peersRef, subscribePeers]);
}
