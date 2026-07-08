import type { Camera } from '../../machine/tool-machine.types';

interface DevOverlayProps {
  shapeCount: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  camera: Camera;
}

/**
 * Dev-only overlay showing canvas state. Removed in PR #15 in favor of
 * a proper debug panel.
 */
export function DevOverlay({
  shapeCount,
  width,
  height,
  devicePixelRatio,
  camera,
}: DevOverlayProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        padding: '8px 12px',
        background: 'rgba(0, 0, 0, 0.65)',
        color: 'white',
        fontFamily: 'monospace',
        fontSize: 11,
        borderRadius: 4,
        pointerEvents: 'none',
      }}
    >
      <div>shapes: {shapeCount}</div>
      <div>
        size: {width} × {height}
      </div>
      <div>dpr: {devicePixelRatio}x</div>
      <div>
        camera: {camera.x.toFixed(0)}, {camera.y.toFixed(0)} @ {(camera.zoom * 100).toFixed(0)}%
      </div>
    </div>
  );
}
