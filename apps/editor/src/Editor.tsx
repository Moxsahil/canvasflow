import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import {
  computeBoundingRect,
  createText,
  fitRectToViewport,
  hitTest,
  isText,
  presenceColorFor,
  rectIntersectsViewport,
  shapesIntersectingSegment,
  SpatialIndex,
  type Camera,
  type Shape,
} from '@canvasflow/canvas-engine';
import { readShapesFromClipboard, writeShapesToClipboard } from './clipboard';
import { CanvasStack } from './canvas/CanvasStack';
import { pointerCursorValue } from './canvas/pointer-cursor';
import { resolveCanvasBackground } from './properties/palette';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { useCanvasBackground } from './canvas/useCanvasBackground';
import { AppSidebar, readSidebarState } from './menu';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toolbar } from './toolbar/Toolbar';
import { HistoryPanel } from './toolbar/HistoryPanel';
import { GlassDock, GlassDockSeparator } from '@/components/ui/glass-dock';
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
import { decodeJwtUser, decodeJwtWorkspaceId } from './auth/token';
import { useBoardSwitcher } from './workspace';
import {
  CursorLayer,
  FollowingChip,
  PeerList,
  PresenceChannel,
  useFollowMode,
  useIdleDetector,
  usePeerPresence,
  useSelfPresence,
} from './collab';
import { useAppTheme } from './theme';
import { useOpenBoardFile, useSaveBoardFile } from './file';
import { ExportImageDialog } from './export';
import { FindBar, useCanvasSearch } from './search';
import { AccessRevokedDialog, ShareDialog } from './share';
import { Dialog } from './ui';

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

interface EditorProps {
  boardId: string;
}

export function Editor({ boardId }: EditorProps) {
  /** The editor root. Every popup portals here, for the theme tokens on it. */
  const editorRef = useRef<HTMLDivElement>(null);
  /** The space left of the sidebar: what the canvas fills and measures. */
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);

  /**
   * Held in state rather than read straight off the ref: a ref is still null on
   * the first render, and nothing would necessarily re-render to pick it up, so
   * popups would portal to <body> and paint with unresolved tokens.
   */
  const [editorRoot, setEditorRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setEditorRoot(editorRef.current), []);

  // Read once: the sidebar owns the value from here on, and re-reading its
  // cookie mid-session would fight whatever the user has just toggled.
  const [sidebarDefaultOpen] = useState(readSidebarState);

  const {
    authToken,
    refresh: refreshAuthToken,
    accessDenied: tokenAccessDenied,
  } = useAuthToken(boardId);

  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  /**
   * This session has lost the board.
   *
   * Latched rather than derived, because it has to survive the teardown that
   * follows it: the socket goes, the token stops being re-mintable, and none
   * of what remains would still say why. It arrives by whichever route
   * notices first — the server pushing a revocation onto the live connection,
   * a refused reconnect, or a token refresh being turned down.
   */
  const [accessRevoked, setAccessRevoked] = useState(false);
  const showExport = useCallback(() => setExportOpen(true), []);
  const hideExport = useCallback(() => setExportOpen(false), []);
  const showShare = useCallback(() => setShareOpen(true), []);
  const hideShare = useCallback(() => setShareOpen(false), []);
  /** Shared by the open and save flows — whichever has something to report. */
  // Carries its own heading: the open, save and copy-link flows all report
  // through here, and a shared dialog titled for only one of them mislabels
  // the other two.
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const showOpenNotice = useCallback(
    (body: string) => setNotice({ title: 'Open board', body }),
    [],
  );
  const showSaveNotice = useCallback(
    (body: string) => setNotice({ title: 'Save board', body }),
    [],
  );

  const { canvasBackground, setCanvasBackground } = useCanvasBackground(boardId);
  const { theme, resolvedTheme, setTheme, toggleTheme } = useAppTheme();

  const handleShowHelp = useCallback(() => setHelpOpen(true), []);
  const handleCloseHelp = useCallback(() => setHelpOpen(false), []);

  // The token has always carried the user's name and role alongside the id;
  // until presence needed them the editor only read the id, which is why the
  // menu's account row has been showing a raw UUID.
  const user = useMemo(() => (authToken ? decodeJwtUser(authToken) : null), [authToken]);
  const userId = user?.id ?? null;

  // The board's identity in the rail: its title, the workspace it sits in, and
  // the rest of the account's boards. Also the only place the board's real
  // title is known — everything else here has nothing but its id.
  const boardSwitcher = useBoardSwitcher({
    boardId,
    workspaceId: authToken ? decodeJwtWorkspaceId(authToken) : null,
  });
  const boardTitle = boardSwitcher.title;
  // With no argument it targets the board on screen, which is what the
  // sidebar's "Rename board" row means.
  const { beginRename, canRename } = boardSwitcher;
  const handleRenameBoard = useCallback(() => beginRename(), [beginRename]);

  const doc = useBoardDocument(boardId, userId);

  /**
   * Viewers may look but not touch.
   *
   * Held on the document rather than checked at each call site, so every write
   * path is covered by construction. The real enforcement is the sync-server
   * marking their socket read-only; this stops a viewer's rejected edits
   * lingering in their local doc as shapes nobody else can see.
   *
   * Defaults to read-only until a token has been decoded — briefly refusing an
   * edit is recoverable, briefly permitting one is not.
   *
   * A revoked session is read-only for the same reason and then some: there is
   * no longer a socket to reject its writes, so this is the only thing between
   * a keystroke and a shape appearing in a document nobody will ever collect.
   */
  const readOnly = accessRevoked || (user?.readOnly ?? true);

  useEffect(() => {
    doc.setReadOnly(readOnly);
  }, [doc, readOnly]);
  const shapes = useYjsShapes(doc);
  const { canUndo, canRedo } = useUndoState(doc);

  const {
    status: syncStatus,
    notifyActivity,
    awareness,
    purgeCache,
  } = useBoardSync(doc, {
    boardId,
    apiUrl: env.VITE_API_URL,
    syncUrl: env.VITE_SYNC_URL,
    authToken,
    userId,
    onAuthError: refreshAuthToken,
    // The server changed our role on this live connection. Re-mint the token
    // so `readOnly` and the chrome follow within a second, rather than at the
    // next scheduled refresh up to five minutes away.
    onAccessChanged: refreshAuthToken,
    onAccessRevoked: () => setAccessRevoked(true),
  });

  // The same conclusion reached the slow way: the token route refuses to mint
  // for a board this account cannot open. Covers the reload — where there is
  // no live connection to be told anything on — and someone arriving at a
  // board URL they were never on.
  useEffect(() => {
    if (tokenAccessDenied) setAccessRevoked(true);
  }, [tokenAccessDenied]);

  /**
   * Let go of the cached copy, once.
   *
   * This is what would otherwise repaint the whole board on the next visit to
   * this URL — with no server left to correct it, and no dialog either, since
   * nothing at that point would know what had happened. The document itself
   * is sealed through `readOnly` above.
   */
  const cachePurgedRef = useRef(false);
  useEffect(() => {
    if (!accessRevoked || cachePurgedRef.current) return;
    cachePurgedRef.current = true;
    purgeCache();
  }, [accessRevoked, purgeCache]);

  // Suspended while disconnected: a frozen cursor from a socket that has gone
  // away is worse than no cursor.
  const activity = useIdleDetector(awareness !== null);
  const presenceTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  // One channel per connection. A reconnect issues a fresh transport, so the
  // channel is rebuilt with it rather than being patched in place.
  const [channel, setChannel] = useState<PresenceChannel | null>(null);
  useEffect(() => {
    if (!awareness) {
      setChannel(null);
      return;
    }
    const next = new PresenceChannel(awareness);
    setChannel(next);
    return () => {
      next.dispose();
      setChannel(null);
    };
  }, [awareness]);

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

  // --- presence -----------------------------------------------------------
  // Placed after the camera exists: following needs to read and write it, and
  // publishing our own viewport needs its current value.
  const screen = useMemo(() => ({ width, height }), [width, height]);

  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const follow = useFollowMode({
    channel,
    selfUserId: user?.id ?? null,
    screen,
    getCamera: () => cameraRef.current,
    setCamera: (next) => actorRef.send({ type: 'SET_CAMERA', camera: next }),
  });

  const { setCursor, setSelection } = useSelfPresence({
    channel,
    user,
    activity,
    camera,
    screen,
    following: follow.following,
  });

  const { peersRef, subscribe, roster } = usePeerPresence({
    channel,
    self: user ? { id: user.id, name: user.name } : null,
    selfActivity: activity,
  });

  const followedPeer = follow.following
    ? roster.find((entry) => entry.userId === follow.following)
    : undefined;

  /**
   * Who is on the board, as a value that changes only when the set does.
   *
   * The roster is rebuilt for an activity change as well as an arrival, and
   * sorted because its order follows whichever socket spoke first. What the
   * share card wants to hear about is somebody new, not somebody going idle.
   */
  const presenceKey = useMemo(
    () =>
      roster
        .map((entry) => entry.userId)
        .sort()
        .join(','),
    [roster],
  );

  /**
   * Your pointer takes your presence colour only while somebody else is on the
   * board, where it means something: the arrow on your screen is then the one
   * they see. Alone, a coloured pointer is just an unexplained colour, so the
   * theme's own black-on-light / white-on-dark default stands.
   *
   * `undefined` deliberately, rather than a neutral colour computed here — it
   * leaves --cursor-select unset so the value in cursors.css applies, and that
   * one already follows the theme.
   */
  const collaborating = roster.some((entry) => !entry.isSelf);
  const pointerCursor = useMemo(
    () =>
      collaborating && userId
        ? pointerCursorValue(presenceColorFor(userId, presenceTheme))
        : undefined,
    [collaborating, userId, presenceTheme],
  );

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

  // Nothing in the properties panel does anything for a viewer, and offering
  // controls that silently no-op is worse than not offering them.
  const showProperties = !readOnly && (selectedShapes.length > 0 || toolShapeKind !== null);

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

  // Selection is a transition, not a stream — publishing it from an effect
  // rather than the pointer handlers means marquee, click, shortcut and undo
  // all reach collaborators through the same path.
  useEffect(() => {
    setSelection(selectedIds);
  }, [selectedIds, setSelection]);

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

  // --- initial view --------------------------------------------------------
  /**
   * Bring the board's content into view the first time it arrives.
   *
   * The camera starts at the origin and is never persisted, so a board whose
   * shapes sit far from (0,0) reloads to what looks like an empty canvas even
   * though every shape is present in the document — which is what opening a
   * file does, since a drawing's own coordinates are rarely near our origin.
   *
   * Only fires when nothing is on screen already, so the ordinary case of
   * content near the origin keeps the view exactly where it was.
   */
  const didInitialViewFitRef = useRef(false);

  useEffect(() => {
    didInitialViewFitRef.current = false;
  }, [boardId]);

  useEffect(() => {
    if (didInitialViewFitRef.current) return;
    // Wait for both the content and a measured viewport — fitting against a
    // zero-sized canvas would put the camera somewhere meaningless.
    if (shapes.length === 0 || width === 0 || height === 0) return;

    didInitialViewFitRef.current = true;

    const rect = computeBoundingRect(shapes);
    if (!rect) return;
    if (rectIntersectsViewport(rect, actorRef.getSnapshot().context.camera, { width, height })) {
      return;
    }
    actorRef.send({
      type: 'SET_CAMERA',
      camera: fitRectToViewport(rect, { width, height }, { maxZoom: 1 }),
    });
  }, [shapes, width, height, actorRef]);

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

  // Moving the view yourself ends a follow. You cannot be carried and steer at
  // the same time, and a chase that silently fights your scrolling feels broken
  // rather than deliberate.
  const handleWheelZoom = useCallback(
    (delta: number, anchor: Point) => {
      follow.notifyUserCameraInput();
      actorRef.send({ type: 'ZOOM_BY', delta, anchor });
    },
    [actorRef, follow],
  );
  const handleWheelPan = useCallback(
    (dx: number, dy: number) => {
      follow.notifyUserCameraInput();
      actorRef.send({ type: 'PAN_BY', dx, dy });
    },
    [actorRef, follow],
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
  const handleDelete = useCallback(() => actorRef.send({ type: 'DELETE_SELECTED' }), [actorRef]);
  const handleSelectAll = useCallback(
    () => actorRef.send({ type: 'SELECT_ALL', shapeIds: shapes.map((s) => s.id) }),
    [actorRef, shapes],
  );
  // handleUndo/handleRedo are defined further down, with the open-file flow —
  // they have to know about the camera an open moved.

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

  // --- opening a board file -----------------------------------------------
  /**
   * Opening a file moves the viewport as well as the document, so undoing it
   * has to move the viewport back. Without this the board is restored where it
   * always was while the camera stays parked over the opened file's
   * coordinates — which look like an empty canvas, since a file's contents are
   * rarely anywhere near the board's.
   *
   * The edits are held by identity rather than by position in the undo stack:
   * a handle only matches the edit it came from, so later edits (which discard
   * the redo stack anyway) can never be mistaken for the open.
   */
  const openViewRef = useRef<{
    undoItem: object | null;
    redoItem: object | null;
    before: Camera;
    after: Camera;
  } | null>(null);

  // Fit the camera to what was just loaded and drop the old selection, which
  // points at shapes the replace has already removed.
  const handleBoardFileLoaded = useCallback(
    (loaded: readonly Shape[], background?: string) => {
      if (background) setCanvasBackground(background);
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [] });

      // Read through the actor rather than the render-time value, so this is
      // the camera as it stands at the moment of the open.
      const before = actorRef.getSnapshot().context.camera;
      const rect = computeBoundingRect(loaded);
      const after = rect ? fitRectToViewport(rect, { width, height }, { maxZoom: 1 }) : before;
      if (rect) {
        actorRef.send({ type: 'SET_CAMERA', camera: after });
      }
      openViewRef.current = {
        undoItem: doc.peekUndoItem(),
        redoItem: null,
        before,
        after,
      };
    },
    [actorRef, doc, setCanvasBackground, width, height],
  );

  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);

  const { openBoardFile, pendingReplace, confirmReplace, cancelReplace } = useOpenBoardFile({
    doc,
    shapeCount: shapes.length,
    genId,
    onLoaded: handleBoardFileLoaded,
    fileHandleRef,
    onNotice: showOpenNotice,
  });

  const { saveBoardFileToDisk } = useSaveBoardFile({
    shapes,
    canvasBackground,
    boardName: boardTitle,
    fileHandleRef,
    onNotice: showSaveNotice,
  });

  const setCamera = useCallback(
    (next: Camera) => actorRef.send({ type: 'SET_CAMERA', camera: next }),
    [actorRef],
  );

  const search = useCanvasSearch({
    shapes,
    camera,
    viewport: { width, height },
    onCameraChange: setCamera,
  });

  const handleUndo = useCallback(() => {
    const undoing = doc.peekUndoItem();
    doc.undo();
    const opened = openViewRef.current;
    if (opened && undoing && undoing === opened.undoItem) {
      actorRef.send({ type: 'SET_CAMERA', camera: opened.before });
      // The redo of this undo is a fresh stack item; remember it so redoing
      // the open takes the viewport forward again.
      opened.undoItem = null;
      opened.redoItem = doc.peekRedoItem();
    }
  }, [actorRef, doc]);

  const handleRedo = useCallback(() => {
    const redoing = doc.peekRedoItem();
    doc.redo();
    const opened = openViewRef.current;
    if (opened && redoing && redoing === opened.redoItem) {
      actorRef.send({ type: 'SET_CAMERA', camera: opened.after });
      opened.redoItem = null;
      opened.undoItem = doc.peekUndoItem();
    }
  }, [actorRef, doc]);

  /**
   * Copy this board's own URL.
   *
   * Distinct from the share dialog: this is the link for people who can
   * already reach the board, and it mints nothing. Opening it signs the
   * recipient in against their own access — see useAuthToken, which now
   * recovers a token when a board is opened without one. Someone with no
   * access needs a share link instead.
   */
  const handleCopyBoardLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice({
        title: 'Link copied',
        body: 'Anyone who already has access can open this board with it. To invite someone new, use Live collaboration.',
      });
    } catch {
      setNotice({
        title: 'Link copied',
        body: 'Could not copy the link. Copy it from the address bar instead.',
      });
    }
  }, []);

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
    onResetView: handleZoomTo100,
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
    onShowHelp: handleShowHelp,
    onToggleTheme: toggleTheme,
    onOpenFile: openBoardFile,
    onSaveFile: saveBoardFileToDisk,
    onExportImage: showExport,
    onFind: search.openSearch,
    // The dialogs own the keyboard while they're up, so ⌘O can't stack a
    // second picker on top of an unanswered replace confirmation.
    disabled:
      helpOpen ||
      exportOpen ||
      shareOpen ||
      pendingReplace !== null ||
      notice !== null ||
      accessRevoked,
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
      ref={editorRef}
      className="cf-editor"
      data-theme={resolvedTheme}
      style={
        {
          position: 'fixed',
          inset: 0,
          overflow: 'hidden',
          // Overrides the neutral default in cursors.css for the whole editor.
          ...(pointerCursor ? { '--cursor-select': pointerCursor } : {}),
        } as React.CSSProperties
      }
    >
      <SidebarProvider defaultOpen={sidebarDefaultOpen} className="h-full min-h-0">
        <AppSidebar
          boardSwitcher={boardSwitcher}
          user={user && { name: user.name, email: user.email }}
          canvasBackground={canvasBackground}
          onCanvasBackgroundChange={setCanvasBackground}
          canvasTheme={presenceTheme}
          theme={theme}
          onThemeChange={setTheme}
          portalContainer={editorRoot}
          /* A menu item goes live by being given a handler here; anything
             without one renders disabled with a "Soon" badge, so the menu stays
             complete while the features behind it land. */
          actions={{
            renameBoard: canRename ? handleRenameBoard : undefined,
            open: openBoardFile,
            saveTo: saveBoardFileToDisk,
            exportImage: showExport,
            liveCollaboration: showShare,
            copyLink: handleCopyBoardLink,
            findOnCanvas: search.openSearch,
            help: handleShowHelp,
          }}
        />

        {/* The canvas and everything floating over it. Positioned, so the
            chrome inside anchors to the space left of the sidebar rather than
            to the window — and measured, so the canvas resizes with it. */}
        <SidebarInset className="relative min-w-0 overflow-hidden">
          <div ref={containerRef} className="absolute inset-0">
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
              backgroundColor={resolveCanvasBackground(canvasBackground, presenceTheme)}
              searchHighlights={search.highlights}
              onPointerHover={setCursor}
            />

            {/* Collaborator cursors. A sibling of CanvasStack, never inside it —
          .canvas-stack carries the dark-mode inversion filter, which would
          flip every peer colour. */}
            <CursorLayer
              peersRef={peersRef}
              subscribe={subscribe}
              camera={camera}
              screen={screen}
              theme={presenceTheme}
            />

            {followedPeer && (
              <FollowingChip
                name={followedPeer.name}
                userId={followedPeer.userId}
                theme={presenceTheme}
                onStop={follow.stop}
              />
            )}

            {/* Top-right chrome shares one axis; the dock places them so neither
          child has to know the other's width. */}
            <div className="cf-top-right-dock">
              <FindBar search={search} />
              <PeerList
                roster={roster}
                theme={presenceTheme}
                following={follow.following}
                onFollow={follow.follow}
                onStopFollowing={follow.stop}
                onShare={showShare}
                readOnly={readOnly}
                portalContainer={editorRoot}
              />
            </div>

            {/* Collapses and expands the sidebar. Floating over the canvas because
          the editor has no header bar to seat it in, and it is the only way
          back to the sidebar on a viewport too narrow to keep one on screen. */}
            <SidebarTrigger className="absolute top-4 left-4 z-(--zIndex-layerUI)" />

            <div className="cf-bottom-dock">
              <GlassDock aria-label="Editing tools">
                {!readOnly && (
                  <>
                    <HistoryPanel
                      canUndo={canUndo}
                      canRedo={canRedo}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                    />
                    <GlassDockSeparator />
                  </>
                )}
                <Toolbar
                  activeTool={activeTool}
                  onToolChange={handleToolChange}
                  readOnly={readOnly}
                />
              </GlassDock>
            </div>

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
              syncStatus={syncStatus}
              theme={resolvedTheme}
              onThemeChange={setTheme}
              canZoomToFit={shapes.length > 0}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleZoomTo100}
              onZoomToFit={handleZoomToFit}
            />
            <ShortcutsModal
              open={helpOpen}
              onClose={handleCloseHelp}
              portalContainer={editorRoot}
            />

            <ShareDialog
              open={shareOpen}
              onClose={hideShare}
              boardId={boardId}
              boardName={boardTitle}
              presenceKey={presenceKey}
              portalContainer={editorRoot}
            />

            <Dialog
              open={pendingReplace !== null}
              title="Replace board contents?"
              confirmLabel="Replace"
              destructive
              onConfirm={confirmReplace}
              onClose={cancelReplace}
            >
              Opening <strong>{pendingReplace?.fileName}</strong> replaces the {shapes.length} shape
              {shapes.length === 1 ? '' : 's'} on this board for everyone in it. You can undo this
              with ⌘Z.
            </Dialog>

            <ExportImageDialog
              open={exportOpen}
              onClose={hideExport}
              shapes={shapes}
              selectedShapes={selectedShapes}
              boardName={boardTitle}
              canvasBackground={canvasBackground}
              darkTheme={resolvedTheme === 'dark'}
              portalContainer={editorRoot}
            />

            <Dialog open={notice !== null} title={notice?.title ?? ''} onClose={dismissNotice}>
              {notice?.body}
            </Dialog>

            {/* Last, so it paints over every other dialog. Losing the board
                outranks whatever was being confirmed when it happened. */}
            <AccessRevokedDialog
              open={accessRevoked}
              boardName={boardTitle}
              isGuest={user?.isGuest ?? false}
              container={editorRoot}
            />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
