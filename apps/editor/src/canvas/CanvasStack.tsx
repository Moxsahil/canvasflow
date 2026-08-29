import { useCallback, useRef } from 'react';
import type { ImageSource, Rect, Shape } from '@canvasflow/canvas-engine';
import type { Camera, Point } from '../machine/tool-machine.types';
import type { Tool } from '../tools/tool';
import { useCanvasResize } from './hooks/useCanvasResize';
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio';
import { useStaticRender } from './hooks/useStaticRender';
import { useNewElementRender } from './hooks/useNewElementRender';
import { useInteractiveRender } from './hooks/useInteractiveRender';
import { usePointerEvents } from '../pointer/usePointerEvents';
import { useWheelEvents } from '../pointer/useWheelEvents';
import { screenToWorld, eventToCanvasScreen } from '../pointer/coords';
import { imageFilesFromDataTransfer } from '../images';

interface CanvasStackProps {
  shapes: readonly Shape[];
  pendingErasureIds?: ReadonlySet<string>;
  hiddenFrameLabelIds?: ReadonlySet<string>;
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
  /** Decoded image bitmaps, and a counter that changes when one lands. */
  images?: ImageSource;
  imageRevision?: number;
  /** Drives the compensating filter that keeps photographs out of the inversion. */
  darkMode?: boolean;
  /** Image files dropped onto the canvas, with the world point they landed on. */
  onDropFiles?: (files: File[], at: Point) => void;
  /** Remote collaborators. Absent until a connection exists. */
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
  hiddenFrameLabelIds,
  newElement,
  selectedIds,
  marquee,
  activeTool,
  camera,
  isSpacePressed,
  backgroundColor,
  searchHighlights,
  images,
  imageRevision,
  darkMode,
  onDropFiles,
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

  const { width, height } = useCanvasResize(containerRef);
  const dpr = useDevicePixelRatio();

  useStaticRender(staticCanvasRef, {
    width,
    height,
    shapes,
    camera,
    devicePixelRatio: dpr,
    pendingErasureIds,
    hiddenFrameLabelIds,
    images,
    imageRevision,
    darkMode,
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

  /**
   * Dropped images land where they were dropped, not at the viewport centre.
   *
   * `dragover` has to be cancelled as well as `drop`: without it the browser
   * treats the canvas as a non-target and navigates away to the dropped file,
   * losing the board.
   */
  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!onDropFiles) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [onDropFiles],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      if (!onDropFiles) return;
      const files = imageFilesFromDataTransfer(event.dataTransfer);
      if (files.length === 0) return;
      event.preventDefault();

      // screenToWorld subtracts the canvas origin itself, so it wants the raw
      // client coordinates rather than ones already made canvas-relative.
      const canvas = interactiveCanvasRef.current;
      const at = canvas
        ? screenToWorld(event.clientX, event.clientY, canvas, camera)
        : { x: camera.x, y: camera.y };

      onDropFiles(files, at);
    },
    [onDropFiles, camera],
  );

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
    // The background is painted out here, not on .canvas-stack, because that
    // element carries the dark-mode inversion filter. Inside it, a chosen
    // colour would be inverted into a different one; out here each theme's
    // colour lands exactly as written, while the canvases within still invert
    // so existing drawings stay readable.
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, background: backgroundColor }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div
        className="canvas-stack"
        data-tool={cursorClass}
        style={{
          position: 'absolute',
          inset: 0,
        }}
      >
        <canvas ref={staticCanvasRef} style={canvasStyle} aria-label="Static canvas" />
        <canvas ref={newElementCanvasRef} style={canvasStyle} aria-label="New element canvas" />
        <canvas ref={interactiveCanvasRef} style={canvasStyle} aria-label="Interactive canvas" />
      </div>
    </div>
  );
}
