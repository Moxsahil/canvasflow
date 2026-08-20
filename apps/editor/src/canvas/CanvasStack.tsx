import { useCallback, useRef } from 'react';
import type { Peer, PresenceTheme, Rect, Shape } from '@canvasflow/canvas-engine';
import type { Camera, Point } from '../machine/tool-machine.types';
import type { Tool } from '../tools/tool';
import { useCanvasResize } from './hooks/useCanvasResize';
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio';
import { useStaticRender } from './hooks/useStaticRender';
import { useNewElementRender } from './hooks/useNewElementRender';
import { useInteractiveRender } from './hooks/useInteractiveRender';
import { usePresenceRender } from './hooks/usePresenceRender';
import { usePointerEvents } from '../pointer/usePointerEvents';
import { useWheelEvents } from '../pointer/useWheelEvents';
import { screenToWorld, eventToCanvasScreen } from '../pointer/coords';

export interface CanvasPresence {
  peersRef: React.MutableRefObject<readonly Peer[]>;
  subscribe: (listener: () => void) => () => void;
  theme: PresenceTheme;
}

const NO_PEERS: readonly Peer[] = [];
const noopSubscribe = () => () => {};

interface CanvasStackProps {
  shapes: readonly Shape[];
  pendingErasureIds?: ReadonlySet<string>;
  newElement: Shape | null;
  selectedIds: readonly string[];
  marquee: { x: number; y: number; width: number; height: number } | null;
  activeTool: Tool;
  camera: Camera;
  isSpacePressed: boolean;
  /** Painted behind the (transparent) canvases — see useCanvasBackground. */
  backgroundColor: string;
  /** Find-on-canvas highlights, in world space. */
  searchHighlights?: { rects: readonly Rect[]; focusedRects: readonly Rect[] };
  /** Remote collaborators. Absent until a connection exists. */
  presence?: CanvasPresence;
  /** Pointer position in world space, for publishing to collaborators. */
  onPointerHover?: (point: Point | null) => void;
  onPointerDown: (point: Point, screenPoint: Point, button: number, shiftKey: boolean) => void;
  onPointerMove: (point: Point, screenPoint: Point, screenDelta: Point, altKey: boolean) => void;
  onPointerUp: (point: Point, screenPoint: Point) => void;
  onDoubleClick: (point: Point, screenPoint: Point) => void;
  onWheelZoom: (delta: number, anchor: Point) => void;
  onWheelPan: (dx: number, dy: number) => void;
  isPanning: boolean;
}

export function CanvasStack({
  shapes,
  pendingErasureIds,
  newElement,
  selectedIds,
  marquee,
  activeTool,
  camera,
  isSpacePressed,
  backgroundColor,
  searchHighlights,
  presence,
  onPointerHover,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onWheelZoom,
  onWheelPan,
  isPanning,
}: CanvasStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const newElementCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactiveCanvasRef = useRef<HTMLCanvasElement>(null);
  const presenceCanvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackPeersRef = useRef<readonly Peer[]>(NO_PEERS);

  const { width, height } = useCanvasResize(containerRef);
  const dpr = useDevicePixelRatio();

  useStaticRender(staticCanvasRef, {
    width,
    height,
    shapes,
    camera,
    devicePixelRatio: dpr,
    pendingErasureIds,
  });
  useNewElementRender(newElementCanvasRef, {
    width,
    height,
    newElement,
    camera,
    devicePixelRatio: dpr,
  });
  useInteractiveRender(interactiveCanvasRef, {
    width,
    height,
    shapes,
    selectedIds,
    marquee,
    camera,
    devicePixelRatio: dpr,
    search: searchHighlights,
  });
  usePresenceRender(presenceCanvasRef, {
    width,
    height,
    camera,
    devicePixelRatio: dpr,
    theme: presence?.theme ?? 'light',
    shapes,
    peersRef: presence?.peersRef ?? fallbackPeersRef,
    subscribe: presence?.subscribe ?? noopSubscribe,
  });

  const screenToWorldFn = useCallback(
    (screenX: number, screenY: number) => {
      const canvas = interactiveCanvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      return screenToWorld(screenX, screenY, canvas, camera);
    },
    [camera],
  );

  const eventToCanvasScreenFn = useCallback((event: PointerEvent | WheelEvent) => {
    const canvas = interactiveCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    return eventToCanvasScreen(event as PointerEvent, canvas);
  }, []);

  const handlePointerDown = useCallback(
    (point: Point, screenPoint: Point, button: number, shiftKey: boolean) => {
      onPointerDown(point, screenPoint, button, shiftKey);
    },
    [onPointerDown],
  );

  usePointerEvents(interactiveCanvasRef, {
    onPointerDown: handlePointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onPointerHover,
    screenToWorld: screenToWorldFn,
    eventToCanvasScreen: eventToCanvasScreenFn,
  });

  useWheelEvents(interactiveCanvasRef, {
    onZoom: onWheelZoom,
    onPan: onWheelPan,
    eventToCanvasScreen: eventToCanvasScreenFn,
  });

  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  };

  // Cursor priority: space-pan > active-pan > tool default
  let cursorClass: string;
  if (isSpacePressed || isPanning) {
    cursorClass = 'grabbing';
  } else if (activeTool === 'hand') {
    cursorClass = 'grab';
  } else {
    cursorClass = activeTool;
  }

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
      <div
        className="canvas-stack"
        data-tool={cursorClass}
        style={{
          position: 'absolute',
          inset: 0,
          background: backgroundColor,
        }}
      >
        <canvas ref={staticCanvasRef} style={canvasStyle} aria-label="Static canvas" />
        <canvas ref={newElementCanvasRef} style={canvasStyle} aria-label="New element canvas" />
        <canvas ref={interactiveCanvasRef} style={canvasStyle} aria-label="Interactive canvas" />
      </div>

      {/* Outside .canvas-stack on purpose. That element carries
          `filter: var(--theme-filter)`, which inverts its subtree in dark mode
          so the board and its chrome invert together — but a collaborator's
          colour has to mean the same thing on every screen, and an inverted
          teal is orange. Kept a sibling, presence colours are authored once and
          rendered as written in both themes.

          pointer-events: none so the interactive canvas underneath keeps
          receiving every pointer event and the tool cursor still shows. */}
      <canvas
        ref={presenceCanvasRef}
        style={{ ...canvasStyle, pointerEvents: 'none' }}
        aria-hidden="true"
      />
    </div>
  );
}
