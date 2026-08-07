import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import {
  computeBoundingRect,
  createText,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  fitRectToViewport,
  hitTest,
  isText,
  SpatialIndex,
  type Shape,
} from '@canvasflow/canvas-engine';
import { readShapesFromClipboard, writeShapesToClipboard } from './clipboard';
import { CanvasStack } from './canvas/CanvasStack';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { Toolbar } from './toolbar/Toolbar';
import { TextEditor } from './text-editor/TextEditor';
import { ZoomPanel } from './zoom-panel/ZoomPanel';
import { toolMachine, resizeShape } from './machine/tool-machine';
import { useKeyboardShortcuts } from './tools/useKeyboardShortcuts';
import { hitTestHandles } from './selection/handles';
import { useBoardDocument, useYjsShapes } from './document/useYjsDocument';
import { useUndoState } from './document/useUndoState';
import { useBoardSync } from './sync/useBoardSync';
// import { getAuthTokenFromHash, clearAuthTokenFromHash } from './auth/token';
import { useAuthToken } from './auth/useAuthToken';
import { env } from './lib/env';
import type { Tool } from './tools/tool';
import type { Point } from './machine/tool-machine.types';
import { ShortcutsModal } from './help';
import { ShortcutsHint } from './help/ShortcutsHint';

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface EditorProps {
  boardId: string;
}

export function Editor({ boardId }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);

  // const [authToken] = useState(() => {
  //   const token = getAuthTokenFromHash();
  //   if (token) {
  //     window.sessionStorage.setItem('editor:authToken', token);
  //     clearAuthTokenFromHash();
  //     return token;
  //   }
  //   return window.sessionStorage.getItem('editor:authToken');
  // });

  const { authToken, refresh: refreshAuthToken } = useAuthToken(boardId);

  const [helpOpen, setHelpOpen] = useState(false);

  const handleShowHelp = useCallback(() => setHelpOpen(true), []);
  const handleCloseHelp = useCallback(() => setHelpOpen(false), []);

  const doc = useBoardDocument(boardId);
  const shapes = useYjsShapes(doc);
  const { canUndo, canRedo } = useUndoState(doc);

  // const { status: syncStatus } = useBoardSync(doc, {
  //   boardId,
  //   apiUrl: env.VITE_API_URL,
  //   authToken,
  // });

  const { status: syncStatus } = useBoardSync(doc, {
    boardId,
    apiUrl: env.VITE_API_URL,
    authToken,
    onAuthError: refreshAuthToken,
  });

  const actorRef = useActorRef(toolMachine);

  const activeTool = useSelector(actorRef, (s) => s.context.activeTool);
  const isPanning = useSelector(actorRef, (s) => s.matches('panning'));
  const newElement = useSelector(actorRef, (s) => s.context.newElement);
  const textEditingAt = useSelector(actorRef, (s) => s.context.textEditingAt);
  const editingTextShapeId = useSelector(actorRef, (s) => s.context.editingTextShapeId);
  const editingTextShape = editingTextShapeId
    ? shapes.find((s) => s.id === editingTextShapeId)
    : undefined;
  const editingTextInitialValue =
    editingTextShape && isText(editingTextShape) ? editingTextShape.text : undefined;
  // Bump a key whenever a new text-editing session starts (a new textEditingAt
  // reference), so <TextEditor> remounts with blank state instead of reusing
  // the previous instance — commit/re-entry into editingText happens within
  // one batched update, so textEditingAt never passes through null in between.
  const textEditingKeyRef = useRef(0);
  const prevTextEditingAtRef = useRef(textEditingAt);
  if (textEditingAt !== prevTextEditingAtRef.current) {
    if (textEditingAt) textEditingKeyRef.current += 1;
    prevTextEditingAtRef.current = textEditingAt;
  }
  const camera = useSelector(actorRef, (s) => s.context.camera);
  const isSpacePressed = useSelector(actorRef, (s) => s.context.isSpacePressed);
  const selectedIds = useSelector(actorRef, (s) => s.context.selectedIds);
  const marquee = useSelector(actorRef, (s) => s.context.marquee);

  // While editing, the shape being edited is rendered by the textarea
  // itself — drop it from what's passed to the canvas so it doesn't also
  // render underneath (the Yjs doc still has it; hit-testing/selection
  // elsewhere in this component keep using the full `shapes` array).
  const shapesForRender = useMemo(
    () => (editingTextShapeId ? shapes.filter((s) => s.id !== editingTextShapeId) : shapes),
    [shapes, editingTextShapeId],
  );

  // Textarea is a fixed-position screen-space overlay; the shape/click
  // position is world-space, so convert through the camera. Font size is
  // scaled the same way so the in-place text visually matches the canvas at
  // the current zoom (the stored fontSize on the shape itself is untouched).
  const textEditorScreenPosition = textEditingAt
    ? {
        x: (textEditingAt.x - camera.x) * camera.zoom,
        y: (textEditingAt.y - camera.y) * camera.zoom,
      }
    : null;
  const textEditorFontSize =
    (editingTextShape && isText(editingTextShape) ? editingTextShape.fontSize : DEFAULT_FONT_SIZE) *
    camera.zoom;
  const textEditorFontFamily =
    editingTextShape && isText(editingTextShape)
      ? editingTextShape.fontFamily
      : DEFAULT_FONT_FAMILY;
  const textEditorColor =
    editingTextShape && isText(editingTextShape) ? editingTextShape.strokeColor : '#1e293b';

  const spatialIndex = useMemo(() => {
    const index = new SpatialIndex();
    index.rebuild(shapes);
    return index;
  }, [shapes]);

  const dragOriginsRef = useRef<Record<string, Shape>>({});
  const resizeOriginRef = useRef<Shape | null>(null);
  const pointerDownWorldRef = useRef<Point | null>(null);

  useEffect(() => {
    const sub1 = actorRef.on('shape.committed', (emitted) => {
      doc.addShape(emitted.shape);
    });
    const sub2 = actorRef.on('shapes.deleted', (emitted) => {
      doc.deleteShapes(emitted.ids);
    });
    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
    };
  }, [actorRef, doc]);

  const marqueeRef = useRef(marquee);
  useEffect(() => {
    if (marqueeRef.current && !marquee) {
      const finalMarquee = marqueeRef.current;
      const ids = spatialIndex.searchRect(finalMarquee);
      if (ids.length > 0) {
        actorRef.send({ type: 'SELECT_ALL', shapeIds: ids });
      }
    }
    marqueeRef.current = marquee;
  }, [marquee, spatialIndex, actorRef]);

  const handlePointerDown = useCallback(
    (point: Point, _screenPoint: Point, button: number, shiftKey: boolean) => {
      // The canvas's pointerdown suppresses the browser's default focus
      // handling (see usePointerEvents), which also suppresses the native
      // blur a click-away would normally trigger on an open text editor.
      // Flush it manually so a new click can re-enter editingText.
      if (actorRef.getSnapshot().matches('editingText')) {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement) {
          active.blur();
        }
      }

      pointerDownWorldRef.current = point;

      let hitShapeId: string | null = null;
      let hitHandle: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null = null;

      if (activeTool === 'select' && !isSpacePressed && button !== 1) {
        if (selectedIds.length === 1) {
          const selectedShape = shapes.find((s) => s.id === selectedIds[0]);
          if (selectedShape) {
            hitHandle = hitTestHandles(selectedShape, point.x, point.y, camera.zoom);
            if (hitHandle !== null) {
              resizeOriginRef.current = selectedShape;
            }
          }
        }
        if (hitHandle === null) {
          const hit = hitTest(shapes, spatialIndex, point.x, point.y);
          hitShapeId = hit?.id ?? null;

          if (hit) {
            const idsToMove =
              shiftKey || selectedIds.includes(hit.id)
                ? [...new Set([...selectedIds, hit.id])]
                : [hit.id];
            const origins: Record<string, Shape> = {};
            for (const s of shapes) {
              if (idsToMove.includes(s.id)) origins[s.id] = s;
            }
            dragOriginsRef.current = origins;
          }
        }
      }

      actorRef.send({
        type: 'POINTER_DOWN',
        point,
        button,
        shiftKey,
        hitShapeId,
        hitHandle,
      });
    },
    [actorRef, activeTool, isSpacePressed, selectedIds, shapes, spatialIndex, camera.zoom],
  );

  const handlePointerMove = useCallback(
    (point: Point, _screenPoint: Point, screenDelta: Point) => {
      actorRef.send({ type: 'POINTER_MOVE', point, screenDelta });

      const snap = actorRef.getSnapshot();

      if (snap.matches('draggingSelection') && pointerDownWorldRef.current) {
        const dx = point.x - pointerDownWorldRef.current.x;
        const dy = point.y - pointerDownWorldRef.current.y;
        const origins = dragOriginsRef.current;
        for (const [id, origin] of Object.entries(origins)) {
          doc.updateShape(id, { x: origin.x + dx, y: origin.y + dy });
        }
      }

      if (
        snap.matches('resizingSelection') &&
        pointerDownWorldRef.current &&
        resizeOriginRef.current
      ) {
        const dx = point.x - pointerDownWorldRef.current.x;
        const dy = point.y - pointerDownWorldRef.current.y;
        const originalShape = resizeOriginRef.current;
        const handle = snap.context.resizeHandle;
        if (handle !== null) {
          const resized = resizeShape(originalShape, handle, dx, dy);
          doc.updateShape(originalShape.id, resized);
        }
      }
    },
    [actorRef, doc],
  );

  const handlePointerUp = useCallback(
    (point: Point) => {
      const snap = actorRef.getSnapshot();
      const wasInteracting = snap.matches('draggingSelection') || snap.matches('resizingSelection');

      actorRef.send({ type: 'POINTER_UP', point });
      dragOriginsRef.current = {};
      resizeOriginRef.current = null;
      pointerDownWorldRef.current = null;

      // Break the undo group so the next drag/resize is a separate undo step
      if (wasInteracting) {
        doc.breakUndoGroup();
      }
    },
    [actorRef, doc],
  );

  // Double-clicking a text shape (with any tool active) reopens it for editing.
  const handleDoubleClick = useCallback(
    (point: Point) => {
      const hit = hitTest(shapes, spatialIndex, point.x, point.y);
      if (hit && isText(hit)) {
        actorRef.send({
          type: 'EDIT_TEXT_SHAPE',
          shapeId: hit.id,
          position: { x: hit.x, y: hit.y },
          existingText: hit.text,
        });
      }
    },
    [actorRef, shapes, spatialIndex],
  );

  const handleWheelZoom = useCallback(
    (delta: number, anchor: Point) => actorRef.send({ type: 'ZOOM_BY', delta, anchor }),
    [actorRef],
  );
  const handleWheelPan = useCallback(
    (dx: number, dy: number) => actorRef.send({ type: 'PAN_BY', dx, dy }),
    [actorRef],
  );
  const handleToolChange = useCallback(
    (tool: Tool) => {
      if (actorRef.getSnapshot().matches('editingText')) {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement) {
          active.blur();
        }
      }
      actorRef.send({ type: 'SELECT_TOOL', tool });
    },
    [actorRef],
  );
  const handleEscape = useCallback(() => actorRef.send({ type: 'ESCAPE' }), [actorRef]);
  const handleSpaceDown = useCallback(() => actorRef.send({ type: 'SPACE_DOWN' }), [actorRef]);
  const handleSpaceUp = useCallback(() => actorRef.send({ type: 'SPACE_UP' }), [actorRef]);
  const handleZoomIn = useCallback(
    () => actorRef.send({ type: 'ZOOM_BY', delta: 1.2, anchor: { x: width / 2, y: height / 2 } }),
    [actorRef, width, height],
  );
  const handleZoomOut = useCallback(
    () => actorRef.send({ type: 'ZOOM_BY', delta: 0.8, anchor: { x: width / 2, y: height / 2 } }),
    [actorRef, width, height],
  );
  const handleResetView = useCallback(() => actorRef.send({ type: 'RESET_VIEW' }), [actorRef]);
  const handleDelete = useCallback(() => actorRef.send({ type: 'DELETE_SELECTED' }), [actorRef]);
  const handleSelectAll = useCallback(
    () => actorRef.send({ type: 'SELECT_ALL', shapeIds: shapes.map((s) => s.id) }),
    [actorRef, shapes],
  );
  const handleUndo = useCallback(() => doc.undo(), [doc]);
  const handleRedo = useCallback(() => doc.redo(), [doc]);

  const handleNudge = useCallback(
    (dx: number, dy: number) => {
      if (selectedIds.length === 0) return;
      doc.nudgeShapes(selectedIds, dx, dy);
    },
    [doc, selectedIds],
  );

  const handleBringForward = useCallback(() => {
    if (selectedIds.length !== 1) return;
    doc.bringForward(selectedIds[0]!);
  }, [doc, selectedIds]);

  const handleSendBackward = useCallback(() => {
    if (selectedIds.length !== 1) return;
    doc.sendBackward(selectedIds[0]!);
  }, [doc, selectedIds]);

  const handleBringToFront = useCallback(() => {
    if (selectedIds.length !== 1) return;
    doc.bringToFront(selectedIds[0]!);
  }, [doc, selectedIds]);

  const handleSendToBack = useCallback(() => {
    if (selectedIds.length !== 1) return;
    doc.sendToBack(selectedIds[0]!);
  }, [doc, selectedIds]);

  // Duplicate: clone selected shapes with 10px offset, auto-select the clones
  const handleDuplicate = useCallback(() => {
    if (selectedIds.length === 0) return;
    const newIds = doc.duplicateShapes(selectedIds, { dx: 10, dy: 10 }, genId);
    if (newIds.length > 0) {
      actorRef.send({ type: 'SELECT_ALL', shapeIds: newIds });
    }
  }, [doc, selectedIds, actorRef]);

  // Zoom to 100% (identity zoom, centered on current viewport)
  const handleZoomTo100 = useCallback(() => {
    actorRef.send({
      type: 'SET_CAMERA',
      camera: {
        x: camera.x + (width / camera.zoom - width) / 2,
        y: camera.y + (height / camera.zoom - height) / 2,
        zoom: 1,
      },
    });
  }, [actorRef, camera, width, height]);

  // Zoom to fit all shapes
  const handleZoomToFit = useCallback(() => {
    const rect = computeBoundingRect(shapes);
    if (!rect) return; // No shapes to fit
    const newCamera = fitRectToViewport(rect, { width, height });
    actorRef.send({ type: 'SET_CAMERA', camera: newCamera });
  }, [actorRef, shapes, width, height]);

  // Zoom to selection (falls back to zoom-to-fit if nothing selected)
  const handleZoomToSelection = useCallback(() => {
    const target =
      selectedIds.length > 0 ? shapes.filter((s) => selectedIds.includes(s.id)) : shapes;
    const rect = computeBoundingRect(target);
    if (!rect) return;
    const newCamera = fitRectToViewport(rect, { width, height });
    actorRef.send({ type: 'SET_CAMERA', camera: newCamera });
  }, [actorRef, shapes, selectedIds, width, height]);

  const handleCopy = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));
    await writeShapesToClipboard(selectedShapes);
  }, [shapes, selectedIds]);

  const handleCut = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const selectedShapes = shapes.filter((s) => selectedIds.includes(s.id));
    const wroteOK = await writeShapesToClipboard(selectedShapes);
    if (wroteOK) {
      // Delete via same event as Delete key — one undo step
      actorRef.send({ type: 'DELETE_SELECTED' });
    }
  }, [shapes, selectedIds, actorRef]);

  const handlePaste = useCallback(async () => {
    const pastedShapes = await readShapesFromClipboard(genId);
    if (pastedShapes.length === 0) return;

    // Offset each pasted shape 20px in both axes so they're
    // visually distinguishable from the originals
    const OFFSET = 20;
    const offsetShapes = pastedShapes.map((s) => ({
      ...s,
      x: s.x + OFFSET,
      y: s.y + OFFSET,
    }));

    // Add each shape via the document — each addShape assigns a fresh
    // fractional zIndex above current max, so pasted shapes land on top
    // in their original relative order
    for (const shape of offsetShapes) {
      doc.addShape(shape);
    }

    // Auto-select the pasted shapes so user can immediately drag them
    actorRef.send({
      type: 'SELECT_ALL',
      shapeIds: offsetShapes.map((s) => s.id),
    });
  }, [doc, actorRef]);

  useKeyboardShortcuts({
    onSelectTool: handleToolChange,
    onEscape: handleEscape,
    onSpaceDown: handleSpaceDown,
    onSpaceUp: handleSpaceUp,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onResetView: handleResetView,
    onDelete: handleDelete,
    onSelectAll: handleSelectAll,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onNudge: handleNudge,
    onBringForward: handleBringForward,
    onSendBackward: handleSendBackward,
    onBringToFront: handleBringToFront,
    onSendToBack: handleSendToBack,
    onDuplicate: handleDuplicate,
    onZoomTo100: handleZoomTo100,
    onZoomToFit: handleZoomToFit,
    onZoomToSelection: handleZoomToSelection,
    onCopy: handleCopy,
    onCut: handleCut,
    onPaste: handlePaste,
    disabled: helpOpen,
    onShowHelp: handleShowHelp,
  });

  const handleCommitText = useCallback(
    (text: string) => {
      const snap = actorRef.getSnapshot();
      const pos = snap.context.textEditingAt;
      const editingId = snap.context.editingTextShapeId;
      const trimmed = text.trim();

      if (editingId) {
        if (trimmed) {
          doc.updateShape(editingId, { text });
        } else {
          // Editing an existing shape down to empty text deletes it.
          doc.deleteShapes([editingId]);
        }
      } else if (pos && trimmed) {
        const textShape = createText({ id: genId(), x: pos.x, y: pos.y, text });
        doc.addShape(textShape);
      }

      actorRef.send({ type: 'COMMIT_TEXT', text });
    },
    [actorRef, doc],
  );

  const handleCancelText = useCallback(() => actorRef.send({ type: 'CANCEL_TEXT' }), [actorRef]);

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <CanvasStack
        shapes={shapesForRender}
        newElement={newElement}
        selectedIds={selectedIds}
        marquee={marquee}
        activeTool={activeTool}
        camera={camera}
        isSpacePressed={isSpacePressed}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onWheelZoom={handleWheelZoom}
        onWheelPan={handleWheelPan}
        isPanning={isPanning}
      />

      <Toolbar activeTool={activeTool} onToolChange={handleToolChange} />

      {textEditorScreenPosition && (
        <TextEditor
          key={textEditingKeyRef.current}
          position={textEditorScreenPosition}
          fontSize={textEditorFontSize}
          fontFamily={textEditorFontFamily}
          color={textEditorColor}
          initialText={editingTextInitialValue}
          onCommit={handleCommitText}
          onCancel={handleCancelText}
        />
      )}

      <ZoomPanel
        zoom={camera.zoom}
        canUndo={canUndo}
        canRedo={canRedo}
        syncStatus={syncStatus}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetView}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />
      <ShortcutsHint onClick={handleShowHelp} />
      <ShortcutsModal open={helpOpen} onClose={handleCloseHelp} />
    </div>
  );
}
