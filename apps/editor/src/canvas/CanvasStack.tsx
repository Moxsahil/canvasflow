import { useCallback, useRef } from 'react';
import type {
  BindingHint,
  ImageSource,
  Peer,
  Rect,
  Shape,
  SnapGuide,
} from '@canvasflow/canvas-engine';
import type { Camera, Point } from '../machine/tool-machine.types';
import type { Tool } from '../tools/tool';
import { Grid } from './Grid';
import { useCanvasResize } from './hooks/useCanvasResize';
import { useDevicePixelRatio } from './hooks/useDevicePixelRatio';
import { useStaticRender } from './hooks/useStaticRender';
import { useNewElementRender } from './hooks/useNewElementRender';
import { useInteractiveRender } from './hooks/useInteractiveRender';
import { usePointerEvents } from '../pointer/usePointerEvents';
import { useWheelEvents } from '../pointer/useWheelEvents';
import { screenToWorld, eventToCanvasScreen } from '../pointer/coords';
import { imageFilesFromDataTransfer } from '../images';
import { LIBRARY_DRAG_TYPE } from '../library/library-items';

interface CanvasStackProps {
  shapes: readonly Shape[];
  pendingErasureIds?: ReadonlySet<string>;
  editingFrameIds?: ReadonlySet<string>;
  /** The arrow whose label is open for typing, so its line breaks for the caret. */
  editingArrowLabelId?: string;
  newElement: Shape | null;
  selectedIds: readonly string[];
  marquee: { x: number; y: number; width: number; height: number } | null;
  activeTool: Tool;
  camera: Camera;
  isSpacePressed: boolean;
  /** Painted behind the (transparent) canvases — see canvasBackgroundFor. */
  backgroundColor: string;
  /** Whether the dotted grid is drawn between the background and the shapes. */
  showGrid?: boolean;
  /** Find-on-canvas highlights, in world space. */
  searchHighlights?: { rects: readonly Rect[]; focusedRects: readonly Rect[] };
  /** Alignment evidence for the gesture in progress. */
  snapGuides?: readonly SnapGuide[];
  /** The point handle under the pointer, which reveals the hidden ones. */
  hoveredHandleId?: string | null;
  /** Locked shapes: selected ones are outlined dashed, with no handles. */
  lockedIds?: ReadonlySet<string>;
  /** The locked shapes whose padlock is up, outlined in grey. */
  lockHighlightIds?: readonly string[];
  /** Where an arrow end being drawn or dragged would attach: outlined and marked. */
  bindingHint?: BindingHint | null;
  /** Decoded image bitmaps, and a counter that changes when one lands. */
  images?: ImageSource;
  imageRevision?: number;
  /** Which board this is. Every layer that paints a shape is told the same. */
  darkMode?: boolean;
  /** Image files dropped onto the canvas, with the world point they landed on. */
  onDropFiles?: (files: File[], at: Point) => void;
  /** A library item dragged out of the library and let go over the canvas. */
  onDropLibraryItem?: (id: string, at: Point) => void;
  /**
   * Remote collaborators. Absent until a connection exists.
   *
   * A ref and a subscription rather than values, so a peer drawing does not
   * re-render this tree on every frame of their gesture.
   */
  peersRef?: React.RefObject<readonly Peer[]>;
  subscribePeers?: (listener: () => void) => () => void;
  /** Pointer position in world space, for publishing to collaborators. */
  onPointerHover?: (point: Point | null) => void;
  onPointerDown: (
    point: Point,
    screenPoint: Point,
    button: number,
    shiftKey: boolean,
    snapOverride: boolean,
  ) => void;
  onPointerMove: (
    point: Point,
    screenPoint: Point,
    screenDelta: Point,
    altKey: boolean,
    snapOverride: boolean,
  ) => void;
  onPointerUp: (point: Point, screenPoint: Point) => void;
  /** A right-button press, settling the selection before the context menu opens. */
  onContextPress?: (point: Point, screenPoint: Point) => void;
  onDoubleClick: (point: Point, screenPoint: Point) => void;
  onWheelZoom: (delta: number, anchor: Point) => void;
  onWheelPan: (dx: number, dy: number) => void;
  isPanning: boolean;
}

export function CanvasStack({
  shapes,
  pendingErasureIds,
  editingFrameIds,
  editingArrowLabelId,
  newElement,
  selectedIds,
  marquee,
  activeTool,
  camera,
  isSpacePressed,
  backgroundColor,
  showGrid,
  searchHighlights,
  snapGuides,
  hoveredHandleId,
  lockedIds,
  lockHighlightIds,
  bindingHint,
  images,
  imageRevision,
  darkMode = false,
  peersRef,
  subscribePeers,
  onDropFiles,
  onDropLibraryItem,
  onPointerHover,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onContextPress,
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
    editingFrameIds,
    editingArrowLabelId,
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
    peersRef,
    subscribePeers,
    darkMode,
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
    snapGuides,
    hoveredHandleId,
    lockedIds,
    lockHighlightIds,
    bindingHint,
    darkMode,
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

  usePointerEvents(interactiveCanvasRef, {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onContextPress,
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
   * Dropped images, and library items, land where they were dropped, not at
   * the viewport centre.
   *
   * `dragover` has to be cancelled as well as `drop`: without it the browser
   * treats the canvas as a non-target and navigates away to the dropped file,
   * losing the board.
   */
  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      // A library item is told apart by its type while still in the air —
      // its id cannot be read until it is let go.
      const libraryItem = event.dataTransfer.types.includes(LIBRARY_DRAG_TYPE);
      if (libraryItem ? !onDropLibraryItem : !onDropFiles) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [onDropFiles, onDropLibraryItem],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      // screenToWorld subtracts the canvas origin itself, so it wants the raw
      // client coordinates rather than ones already made canvas-relative.
      const worldPoint = () => {
        const canvas = interactiveCanvasRef.current;
        return canvas
          ? screenToWorld(event.clientX, event.clientY, canvas, camera)
          : { x: camera.x, y: camera.y };
      };

      const libraryItem = event.dataTransfer.getData(LIBRARY_DRAG_TYPE);
      if (libraryItem) {
        if (!onDropLibraryItem) return;
        event.preventDefault();
        onDropLibraryItem(libraryItem, worldPoint());
        return;
      }

      if (!onDropFiles) return;
      const files = imageFilesFromDataTransfer(event.dataTransfer);
      if (files.length === 0) return;
      event.preventDefault();
      onDropFiles(files, worldPoint());
    },
    [onDropFiles, onDropLibraryItem, camera],
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
    // The background is painted out here, not on .canvas-stack, so that it is
    // laid down once under the drawing rather than cleared and repainted with
    // it on every frame.
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, background: backgroundColor }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {showGrid && <Grid camera={camera} />}

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
