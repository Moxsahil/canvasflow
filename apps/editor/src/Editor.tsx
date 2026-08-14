import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import {
  computeBoundingRect,
  createText,
  fitRectToViewport,
  hitTest,
  isText,
  shapesIntersectingSegment,
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
import { useAuthToken } from './auth/useAuthToken';
import { env } from './lib/env';
import { PropertiesPanel, itemStyleFromShape } from './properties';
import { TOOL_TO_SHAPE_KIND, type Tool } from './tools/tool';
import type { ItemStyle, Point } from './machine/tool-machine.types';
import { ShortcutsModal } from './help';
import { ShortcutsHint } from './help/ShortcutsHint';
import { decodeJwtUserId } from './auth/token';

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface EditorProps {
  boardId: string;
}

export function Editor({ boardId }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);

  const { authToken, refresh: refreshAuthToken } = useAuthToken(boardId);

  const [helpOpen, setHelpOpen] = useState(false);

  const handleShowHelp = useCallback(() => setHelpOpen(true), []);
  const handleCloseHelp = useCallback(() => setHelpOpen(false), []);

  const userId = authToken ? decodeJwtUserId(authToken) : null;

  const doc = useBoardDocument(boardId, userId);
  const shapes = useYjsShapes(doc);
  const { canUndo, canRedo } = useUndoState(doc);

  const { status: syncStatus, notifyActivity } = useBoardSync(doc, {
    boardId,
    apiUrl: env.VITE_API_URL,
    syncUrl: env.VITE_SYNC_URL,
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
  const itemStyle = useSelector(actorRef, (s) => s.context.itemStyle);
  const erasePending = useSelector(actorRef, (s) => s.context.erasePending);

  const shapesForRender = useMemo(
    () => (editingTextShapeId ? shapes.filter((s) => s.id !== editingTextShapeId) : shapes),
    [shapes, editingTextShapeId],
  );

  const textEditorScreenPosition = textEditingAt
    ? {
        x: (textEditingAt.x - camera.x) * camera.zoom,
        y: (textEditingAt.y - camera.y) * camera.zoom,
      }
    : null;
  // Editing an existing shape shows that shape's type; new text previews the
  // style the panel is set to, so the overlay matches what gets committed.
  const editingText = editingTextShape && isText(editingTextShape) ? editingTextShape : null;
  const textEditorFontSize =
    (editingText ? editingText.fontSize : itemStyle.fontSize) * camera.zoom;
  const textEditorFontFamily = editingText ? editingText.fontFamily : itemStyle.fontFamily;
  const textEditorColor = editingText ? editingText.strokeColor : itemStyle.strokeColor;

  // Rebuilt only when the marked set actually changes, so the static canvas
  // isn't invalidated on every pointer move of an eraser stroke.
  const pendingErasureIds = useMemo(() => new Set(erasePending), [erasePending]);

  const spatialIndex = useMemo(() => {
    const index = new SpatialIndex();
    index.rebuild(shapes);
    return index;
  }, [shapes]);

  // --- properties panel ---------------------------------------------------
  // The panel edits the selection when there is one, and otherwise the style
  // the next drawn shape will take. That second mode is why it shows for an
  // active drawing tool on an empty canvas.
  const selectedShapes = useMemo(
    () => shapes.filter((s) => selectedIds.includes(s.id)),
    [shapes, selectedIds],
  );

  const toolShapeKind =
    activeTool in TOOL_TO_SHAPE_KIND
      ? TOOL_TO_SHAPE_KIND[activeTool as keyof typeof TOOL_TO_SHAPE_KIND]
      : null;

  const propertyShapeKinds = useMemo<Shape['kind'][]>(() => {
    if (selectedShapes.length > 0) return [...new Set(selectedShapes.map((s) => s.kind))];
    return toolShapeKind ? [toolShapeKind] : [];
  }, [selectedShapes, toolShapeKind]);

  const firstSelected = selectedShapes[0];
  const propertyStyle: ItemStyle = firstSelected
    ? itemStyleFromShape(firstSelected, itemStyle)
    : itemStyle;

  const showProperties = selectedShapes.length > 0 || toolShapeKind !== null;

  const handleStyleChange = useCallback(
    (patch: Partial<ItemStyle>, transient = false) => {
      // Always remember the choice, so the next shape drawn inherits it.
      actorRef.send({ type: 'SET_ITEM_STYLE', style: patch });
      if (selectedIds.length === 0) return;
      for (const id of selectedIds) {
        doc.updateShape(id, patch);
      }

      if (!transient) doc.breakUndoGroup();
    },
    [actorRef, doc, selectedIds],
  );

  const dragOriginsRef = useRef<Record<string, Shape>>({});
  const resizeOriginRef = useRef<Shape | null>(null);
  const pointerDownWorldRef = useRef<Point | null>(null);
  /** Previous point of the eraser stroke, so each move sweeps a segment. */
  const lastErasePointRef = useRef<Point | null>(null);

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
      notifyActivity();
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

      // After POINTER_DOWN, so the machine is already in `erasing` — the idle
      // state has no ERASE_MARK handler and would drop this silently.
      // A click produces no pointer move, so mark the spot directly, otherwise
      // tapping a shape would do nothing.
      if (activeTool === 'eraser') {
        lastErasePointRef.current = point;
        const ids = shapesIntersectingSegment(
          shapes,
          spatialIndex,
          [
            [point.x, point.y],
            [point.x, point.y],
          ],
          camera.zoom,
        );
        if (ids.length > 0) {
          actorRef.send({ type: 'ERASE_MARK', ids, restore: false });
        }
      }
    },
    [
      actorRef,
      activeTool,
      isSpacePressed,
      selectedIds,
      shapes,
      spatialIndex,
      camera.zoom,
      notifyActivity,
    ],
  );

  const handlePointerMove = useCallback(
    (point: Point, _screenPoint: Point, screenDelta: Point, altKey = false) => {
      actorRef.send({ type: 'POINTER_MOVE', point, screenDelta });

      const snap = actorRef.getSnapshot();

      if (snap.matches('erasing')) {
        // Test the span the pointer just swept, not where it landed: between
        // two events the cursor can jump clean over a shape.
        const from = lastErasePointRef.current ?? point;
        lastErasePointRef.current = point;
        const ids = shapesIntersectingSegment(
          shapes,
          spatialIndex,
          [
            [from.x, from.y],
            [point.x, point.y],
          ],
          camera.zoom,
        );
        if (ids.length > 0) {
          actorRef.send({ type: 'ERASE_MARK', ids, restore: altKey });
        }
      }

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
    // shapes/spatialIndex/zoom feed the eraser hit-test; omitting them freezes
    // this callback on the first render's empty document.
    [actorRef, doc, shapes, spatialIndex, camera.zoom],
  );

  const handlePointerUp = useCallback(
    (point: Point) => {
      const snap = actorRef.getSnapshot();
      const wasInteracting = snap.matches('draggingSelection') || snap.matches('resizingSelection');

      actorRef.send({ type: 'POINTER_UP', point });
      dragOriginsRef.current = {};
      resizeOriginRef.current = null;
      pointerDownWorldRef.current = null;
      lastErasePointRef.current = null;

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
        const { strokeColor, opacity, fontFamily, fontSize, textAlign } = snap.context.itemStyle;
        const textShape = createText({
          id: genId(),
          x: pos.x,
          y: pos.y,
          text,
          // New text takes whatever the properties panel is showing.
          strokeColor,
          opacity,
          fontFamily,
          fontSize,
          textAlign,
        });
        doc.addShape(textShape);
      }

      actorRef.send({ type: 'COMMIT_TEXT', text });
    },
    [actorRef, doc],
  );

  const handleCancelText = useCallback(() => actorRef.send({ type: 'CANCEL_TEXT' }), [actorRef]);

  return (
    <div
      ref={containerRef}
      className="cf-editor"
      style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}
    >
      <CanvasStack
        shapes={shapesForRender}
        pendingErasureIds={pendingErasureIds}
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

      {showProperties && (
        <PropertiesPanel
          style={propertyStyle}
          shapeKinds={propertyShapeKinds}
          canReorder={selectedIds.length === 1}
          onStyleChange={handleStyleChange}
          layerActions={{
            onSendToBack: handleSendToBack,
            onSendBackward: handleSendBackward,
            onBringForward: handleBringForward,
            onBringToFront: handleBringToFront,
          }}
        />
      )}

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
