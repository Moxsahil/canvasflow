import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import {
  arrowsAffectedBy,
  bindingFor,
  bindingTargetAt,
  boundArrowPatches,
  computeBoundingRect,
  createText,
  isArrow,
  withBindingsCleared,
  type ArrowShape,
  type BoardDocument,
  DEFAULT_FRAME_NAME,
  fitRectToViewport,
  FRAME_LABEL_FONT_FAMILY,
  FRAME_LABEL_FONT_SIZE,
  frameForShape,
  frameLabelAt,
  frameLabelBounds,
  framesIn,
  hasPointHandles,
  hitTest,
  isFrame,
  isText,
  shapeHandleAt,
  withHandlePointInserted,
  withHandlePointMoved,
  membershipAfterResize,
  type FrameShape,
  hitTestMarquee,
  type MarqueeMode,
  presenceColorFor,
  rectIntersectsViewport,
  shapeBounds,
  shapesIntersectingSegment,
  SpatialIndex,
  unionRect,
  type Camera,
  type Rect,
  type Shape,
  type SnapGuide,
} from '@canvasflow/canvas-engine';
import {
  buildSnapTargets,
  dragSnapPoints,
  guidesEqual,
  nearestTargetPoint,
  resizeSnapPoints,
  resolveSnap,
  snappingActive,
  snapThreshold,
  worldViewport,
  NO_SNAP,
  NO_SNAP_TARGETS,
  SNAP_THRESHOLD_PX,
  type SnapTargets,
} from './snapping';
import {
  readImagesFromClipboard,
  readShapesFromClipboard,
  writeShapesToClipboard,
} from './clipboard';
import { CanvasStack } from './canvas/CanvasStack';
import { pointerCursorValue } from './canvas/pointer-cursor';
import { canvasBackgroundFor } from './properties/palette';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { AppSidebar, readSidebarState } from './menu';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toolbar } from './toolbar/Toolbar';
import { HistoryPanel } from './toolbar/HistoryPanel';
import { ToolLockButton } from './toolbar/ToolLockButton';
import { GlassDock, GlassDockSeparator } from '@/components/ui/glass-dock';
import { TextEditor } from './text-editor/TextEditor';
import { ZoomPanel } from './zoom-panel/ZoomPanel';
import { toolMachine, resizeShape, resizeSnapHandle } from './machine/tool-machine';
import { useKeyboardShortcuts } from './tools/useKeyboardShortcuts';
import { CommandPalette, useEditorCommands } from './commands';
import { hitTestHandles } from './selection/handles';
import { useBoardDocument, useYjsShapes } from './document/useYjsDocument';
import { useBoardImages, pickImageFiles } from './images';
import { LaserLayer, useLaserTrails } from './laser';
import { FrameNameEditor } from './frames/FrameNameEditor';
import {
  assignmentsAfterMove,
  duplicateOffsetFor,
  membersHiddenByTheirFrame,
  shapesCapturedBy,
  withFrameMembers,
} from './frames/frame-ops';
import { useUndoState } from './document/useUndoState';
import { useBoardSync } from './sync/useBoardSync';
import { useAuthToken } from './auth/useAuthToken';
import { SignOutDialog } from './auth/SignOutDialog';
import { signOutTo } from './auth/sign-out';
import { env } from './lib/env';
import { PropertiesPanel, itemStyleFromShape } from './properties';
import { TOOL_TO_SHAPE_KIND, isPickerTool, type Tool } from './tools/tool';
import {
  IDENTITY_CAMERA,
  type HandleIndex,
  type ItemStyle,
  type Point,
  type VertexGrab,
} from './machine/tool-machine.types';
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
import { SettingsDialog } from './settings';
import { usePreferences } from './preferences';
import { ConfirmDialog } from './ui';

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** One array, so "nothing is snapping" is the same value every time it is set. */
const EMPTY_GUIDES: readonly SnapGuide[] = [];

/** Likewise for "this gesture moves no bound arrows". */
const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * The tools whose gesture is a shape being pulled out of a starting point.
 *
 * These are the ones where the pointer itself is worth snapping: the corner or
 * the endpoint the gesture is dragging is where the shape is going, so putting
 * it on a neighbour's edge puts the shape there too.
 */
const DRAWS_FROM_POINTER = new Set<Tool>([
  'rectangle',
  'ellipse',
  'diamond',
  'frame',
  'line',
  'arrow',
]);

/**
 * The two whose gesture ends at a single position rather than sweeping a box.
 *
 * The end of a line is going somewhere in particular, so it takes the nearest
 * point outright instead of lining up on each axis separately.
 */
const DRAWS_AN_ENDPOINT = new Set<Tool>(['line', 'arrow']);

/**
 * How far past a shape's edge an arrow end still counts as landing on it.
 *
 * People aim an arrow at a shape, not at its outline, and an end released a
 * few pixels short reads as attached to anyone watching. Matched to the snap
 * threshold so the distance that pulls an end into line is the same distance
 * that attaches it.
 */
const ARROW_BIND_MARGIN = SNAP_THRESHOLD_PX;

/**
 * An arrow with each end attached to whatever it was released on.
 *
 * Both ends on one shape is left unattached: there is no line between a shape
 * and itself to stop at either end of, and the arrow is better left exactly
 * where it was drawn.
 */
function attachArrowEnds(arrow: ArrowShape, shapes: readonly Shape[]): ArrowShape {
  const attached = arrowEndsAttached(arrow, shapes);
  // Nothing under either end leaves the arrow exactly as it was drawn, rather
  // than writing two nulls over two nulls.
  return attached ?? arrow;
}

/**
 * The same, for an end that has been dragged somewhere new.
 *
 * The difference is what happens when an end lands on nothing: here that is an
 * answer — the end was pulled off whatever it was attached to and should let
 * go — where for a freshly drawn arrow it is simply nothing to say.
 */
function reattachArrowEnds(arrow: ArrowShape, shapes: readonly Shape[]): ArrowShape {
  // An arrow with a bend in it is routed by hand and never attaches to
  // anything, here or anywhere else — see `arrowsAffectedBy`. Left alone,
  // rather than told to let go of attachments it does not have.
  if (arrow.points.length !== 2) return arrow;
  return arrowEndsAttached(arrow, shapes) ?? { ...arrow, startBinding: null, endBinding: null };
}

/**
 * An arrow with each end attached to whatever it is over, or null when neither
 * end is over anything it could attach to.
 */
function arrowEndsAttached(arrow: ArrowShape, shapes: readonly Shape[]): ArrowShape | null {
  if (arrow.points.length !== 2) return null;

  const [first, last] = [arrow.points[0]!, arrow.points[1]!];
  const start = { x: arrow.x + first[0], y: arrow.y + first[1] };
  const end = { x: arrow.x + last[0], y: arrow.y + last[1] };

  const startTarget = bindingTargetAt(shapes, start, ARROW_BIND_MARGIN, arrow.id);
  const endTarget = bindingTargetAt(shapes, end, ARROW_BIND_MARGIN, arrow.id);

  if (!startTarget && !endTarget) return null;
  if (startTarget && endTarget && startTarget.id === endTarget.id) return null;

  return {
    ...arrow,
    startBinding: startTarget ? bindingFor(startTarget, start) : null,
    endBinding: endTarget ? bindingFor(endTarget, end) : null,
  };
}

/**
 * The same arrow with the attachment on the end at `index` let go.
 *
 * Only the two ends have one, so a bend point being dragged changes nothing.
 */
function releasedEnd(arrow: ArrowShape, index: number): ArrowShape {
  if (index === 0) return { ...arrow, startBinding: null };
  if (index === arrow.points.length - 1) return { ...arrow, endBinding: null };
  return arrow;
}

/**
 * The arrows a gesture over these shapes will have to redraw.
 *
 * Worked out once when the gesture begins so that the common case — a board
 * with no attached arrows on it — costs one pass and then nothing per frame.
 */
function affectedArrowIds(
  shapes: readonly Shape[],
  changedIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const affected = arrowsAffectedBy(shapes, changedIds);
  return affected.length === 0 ? EMPTY_IDS : new Set(affected.map((arrow) => arrow.id));
}

/** The board keyed by id, for a gesture that is going to be redrawing arrows. */
function shapeMapFor(shapes: readonly Shape[], arrowIds: ReadonlySet<string>): Map<string, Shape> {
  if (arrowIds.size === 0) return new Map();
  return new Map(shapes.map((shape) => [shape.id, shape]));
}

/**
 * Put the named arrows back on the shapes they are attached to.
 *
 * Takes the board as a map rather than reading it from the document, because
 * this runs on every frame of a drag and reading the document means
 * deserializing and sorting every shape on it. The map is written back to as it
 * goes, so the next frame resolves against where things actually are.
 */
function settleBoundArrows(
  doc: BoardDocument,
  shapesById: Map<string, Shape>,
  arrowIds: ReadonlySet<string>,
): void {
  const arrows: ArrowShape[] = [];
  for (const id of arrowIds) {
    const shape = shapesById.get(id);
    if (shape && isArrow(shape)) arrows.push(shape);
  }
  if (arrows.length === 0) return;

  for (const patch of boundArrowPatches(arrows, shapesById)) {
    const geometry = { x: patch.x, y: patch.y, points: patch.points };
    doc.updateShape(patch.id, geometry as Partial<Shape>);
    shapesById.set(patch.id, { ...shapesById.get(patch.id)!, ...geometry } as Shape);
  }
}

/**
 * The same, for the one-off paths — a shape committed, a nudge — where reading
 * the document once is the simplest way to be sure of what is on it.
 */
function settleBoundArrowsInDocument(doc: BoardDocument, changedIds: ReadonlySet<string>): void {
  const shapes = doc.getShapes();
  const affected = arrowsAffectedBy(shapes, changedIds);
  if (affected.length === 0) return;

  settleBoundArrows(
    doc,
    new Map(shapes.map((shape) => [shape.id, shape])),
    new Set(affected.map((arrow) => arrow.id)),
  );
}

/**
 * Let go of any arrow attached to shapes about to be deleted.
 *
 * Called before the delete rather than after, so the arrows are still looking
 * at a board where those shapes exist. Their points need no fixing — they were
 * kept true all along, so an arrow whose shape disappears simply stays where it
 * last was instead of springing back to wherever it was first drawn.
 */
function releaseArrowsFrom(doc: BoardDocument, deletedIds: readonly string[]): void {
  const going = new Set(deletedIds);
  for (const shape of doc.getShapes()) {
    if (!isArrow(shape)) continue;
    const released = withBindingsCleared(shape, going);
    if (!released) continue;
    doc.updateShape(shape.id, {
      startBinding: released.startBinding,
      endBinding: released.endBinding,
    } as Partial<Shape>);
  }
}

/**
 * Whether a resize lands where a guide would say it does.
 *
 * Snapping measures the box one drag produces, then redoes the drag with a
 * correction folded in — which only arrives where it was aimed if the box
 * tracks the drag one for one. Text is sized by a font size and the corner of
 * an image keeps its proportions, so both would land near the guide rather than
 * on it, and a guide a shape misses is worse than no guide at all. The linear
 * kinds have no handle resize to snap in the first place.
 */
function resizeCanSnap(shape: Shape, handle: HandleIndex): boolean {
  switch (shape.kind) {
    case 'text':
    case 'line':
    case 'arrow':
    case 'freehand':
      return false;
    case 'image':
      return handle === 1 || handle === 3 || handle === 5 || handle === 7;
    default:
      return true;
  }
}

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
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
  const showSettings = useCallback(() => setSettingsOpen(true), []);
  const hideSettings = useCallback(() => setSettingsOpen(false), []);
  // Toggled rather than opened: the combo that summons it is the natural way
  // to dismiss it again, and pressing it twice should leave the board alone.
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  const showReset = useCallback(() => setResetOpen(true), []);
  const hideReset = useCallback(() => setResetOpen(false), []);
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

  const { theme, resolvedTheme, setTheme, toggleTheme } = useAppTheme();

  // Held here rather than in the sidebar, because this is where the canvas is:
  // each switch is read from here as the behaviour behind it is built.
  const preferences = usePreferences();

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
    void purgeCache();
  }, [accessRevoked, purgeCache]);

  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const showSignOut = useCallback(() => setSignOutOpen(true), []);

  /**
   * End the session: let go of the board held on this device, then leave for
   * the web app, which is the only origin that can drop the cookie behind it.
   *
   * The cached copy goes only when the board is with the server. `connected`
   * is the strongest claim available here — the socket is up and the document
   * has had somewhere to go — and it is a claim about the connection, not an
   * acknowledgement from the server. Anything weaker than that and the cache
   * is the only copy of the last few minutes' work, so it stays: the store is
   * namespaced per user, so signing back in picks it up and sends it, while
   * deleting it here would be the one part of signing out that cannot be
   * undone by signing in again. The dialog says which of the two is happening.
   */
  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    if (syncStatus === 'connected') {
      try {
        await purgeCache();
      } catch (err) {
        // Never at the cost of the sign-out itself: a cache that refused to be
        // deleted is a worse outcome than a session that stayed open.
        console.error('Failed to discard the cached board on sign out:', err);
      }
    }
    signOutTo(env.VITE_WEB_URL);
  }, [syncStatus, purgeCache]);

  // Suspended while disconnected: a frozen cursor from a socket that has gone
  // away is worse than no cursor.
  const activity = useIdleDetector(awareness !== null);
  const presenceTheme = resolvedTheme === 'dark' ? 'dark' : 'light';

  // One channel per connection. A reconnect issues a fresh transport, so the
  // channel is rebuilt with it rather than being patched in place.
  const [channel, setChannel] = useState<PresenceChannel | null>(null);
  /** The frame whose name is open for editing, if any. */
  const [renamingFrameId, setRenamingFrameId] = useState<string | null>(null);
  /** The point handle under the pointer, if any — see `drawPointHandles`. */
  const [hoveredHandleId, setHoveredHandleId] = useState<string | null>(null);
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
  // What is in the overlay right now, mirrored out of it so collaborators can
  // be shown it. The overlay stays the owner of the value; this is a copy that
  // exists only to be published.
  const [liveText, setLiveText] = useState('');
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

  const { setCursor, setSelection, setLasering, setDraft } = useSelfPresence({
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

  // Peers' trails are rebuilt from the cursor stream on their presence record,
  // so this reads the same roster the cursor layer does.
  const laser = useLaserTrails({
    peersRef,
    subscribe,
    userId,
    theme: presenceTheme,
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

  const showImageNotice = useCallback((body: string) => setNotice({ title: 'Image', body }), []);

  const images = useBoardImages({
    boardId,
    doc,
    shapes,
    token: authToken,
    canEdit: !readOnly,
    onError: showImageNotice,
  });

  /** World-space centre of the viewport — where a picked image lands. */
  const viewportCentre = useCallback(
    () => ({
      x: camera.x + width / 2 / camera.zoom,
      y: camera.y + height / 2 / camera.zoom,
    }),
    [camera, width, height],
  );

  const handleInsertImages = useCallback(
    (files: readonly File[], at?: Point) => {
      void images.insertFiles(files, at ?? viewportCentre());
    },
    [images, viewportCentre],
  );

  /**
   * Choosing the image tool is the whole gesture — the picker opens straight
   * away and there is nothing to draw afterwards, so the toolbar hands back to
   * select rather than leaving a tool armed that does nothing on the canvas.
   */
  const handlePickImage = useCallback(() => {
    // The toolbar already hides this for viewers, but the keyboard shortcut
    // doesn't — and opening a picker only to discard what it returns is worse
    // than the button doing nothing.
    if (readOnly) return;
    void (async () => {
      const centre = viewportCentre();
      try {
        const files = await pickImageFiles();
        if (files.length > 0) await images.insertFiles(files, centre);
      } catch {
        showImageNotice("That file couldn't be opened.");
      }
    })();
  }, [images, viewportCentre, showImageNotice, readOnly]);

  const textEditorScreenPosition = textEditingAt
    ? {
        x: (textEditingAt.x - camera.x) * camera.zoom,
        y: (textEditingAt.y - camera.y) * camera.zoom,
      }
    : null;

  // --- frame rename --------------------------------------------------------
  // Local state rather than a machine event: renaming edits one field of one
  // shape and commits straight to the document, where text editing has to
  // create, update or delete a shape depending on what was typed.
  const renamingFrame = renamingFrameId
    ? (shapes.find((s) => s.id === renamingFrameId && isFrame(s)) as FrameShape | undefined)
    : undefined;

  const frameNameEditor = renamingFrame
    ? (() => {
        const label = frameLabelBounds(renamingFrame, camera.zoom);
        return {
          frame: renamingFrame,
          position: {
            x: (label.x - camera.x) * camera.zoom,
            y: (label.y - camera.y) * camera.zoom,
          },
          // The label is drawn in screen pixels, so its box in world units
          // scales back to a constant height however far the board is zoomed.
          height: label.height * camera.zoom,
          fontSize: FRAME_LABEL_FONT_SIZE,
        };
      })()
    : null;

  // A frame deleted by a collaborator while its name was open for editing
  // leaves the input floating over nothing.
  useEffect(() => {
    if (renamingFrameId && !renamingFrame) setRenamingFrameId(null);
  }, [renamingFrameId, renamingFrame]);

  const editingFrameIds = useMemo(
    () => (renamingFrameId ? new Set([renamingFrameId]) : undefined),
    [renamingFrameId],
  );

  const handleCommitFrameName = useCallback(
    (name: string) => {
      if (renamingFrameId) {
        // Stored trimmed, and a name emptied out goes back to the default
        // label rather than leaving the frame with no handle at all.
        doc.updateShape(renamingFrameId, { name: name.trim() });
        doc.breakUndoGroup();
      }
      setRenamingFrameId(null);
    },
    [doc, renamingFrameId],
  );

  const handleCancelFrameName = useCallback(() => setRenamingFrameId(null), []);
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
  /**
   * The line or arrow a point-drag started from, already carrying any point the
   * gesture created and with the dragged end's attachment let go.
   */
  const vertexOriginRef = useRef<Shape | null>(null);
  /** Whether this point-drag has already written the attachment it let go of. */
  const vertexReleasedRef = useRef(false);
  const pointerDownWorldRef = useRef<Point | null>(null);
  /** Previous point of the eraser stroke, so each move sweeps a segment. */
  const lastErasePointRef = useRef<Point | null>(null);

  /**
   * What the gesture in progress can line up with, measured once when it began.
   *
   * A ref and not state: it is read inside pointer handlers and never rendered,
   * and re-measuring the board on every pointer move would make the cost of a
   * drag depend on how much is on the board rather than on how far it moved.
   *
   * Measured whatever the snapping preference says, because the override key
   * can be taken up in the middle of a drag and there is no second chance to
   * look at where everything was when it started.
   */
  /**
   * Whether the override key was down the last time the pointer reported in.
   *
   * Pointer up carries no modifiers, and the decision about what an arrow
   * attaches to is made once it is released — so the key state has to have been
   * kept from the last move that did report it.
   */
  const snapOverrideRef = useRef(false);

  /**
   * Whether an arrow released now takes hold of what it landed on.
   *
   * A ref because the answer is wanted where a shape is committed, which is a
   * subscription rather than a render: reading the preference there directly
   * would tear that subscription down and rebuild it every time anything else
   * on the preferences menu was ticked. The override key is the one that
   * governs snapping — told not to line an arrow up with a shape, the editor
   * does not attach it to that shape either.
   */
  const bindArrowsRef = useRef(false);
  bindArrowsRef.current = preferences.values.arrowBinding && !snapOverrideRef.current;

  /** Arrows this gesture has to redraw, decided once when it began. */
  const boundArrowsRef = useRef<ReadonlySet<string>>(EMPTY_IDS);
  /**
   * The board as this gesture last left it.
   *
   * Only built when there is an attached arrow to redraw, and then kept current
   * by hand as shapes move, so a drag costs one pass at the start rather than a
   * full read of the document on every frame.
   */
  const gestureShapesRef = useRef<Map<string, Shape>>(new Map());

  const snapTargetsRef = useRef<SnapTargets>(NO_SNAP_TARGETS);
  const [snapGuides, setSnapGuides] = useState<readonly SnapGuide[]>(EMPTY_GUIDES);
  const snapGuidesRef = useRef<readonly SnapGuide[]>(EMPTY_GUIDES);

  /**
   * Show a set of guides, if they are not the ones already up.
   *
   * Holding a shape against an edge produces the identical answer every frame,
   * and re-rendering the canvas each time for a picture that has not changed is
   * the difference between a smooth drag and a stuttering one.
   */
  const showSnapGuides = useCallback((next: readonly SnapGuide[]) => {
    if (guidesEqual(snapGuidesRef.current, next)) return;
    snapGuidesRef.current = next;
    setSnapGuides(next);
  }, []);

  // Selection is a transition, not a stream — publishing it from an effect
  // rather than the pointer handlers means marquee, click, shortcut and undo
  // all reach collaborators through the same path.
  useEffect(() => {
    setSelection(selectedIds);
  }, [selectedIds, setSelection]);

  /**
   * What collaborators see us drawing right now.
   *
   * Both sources resolve here rather than each publishing for itself, because
   * only one draft can be on the wire at a time and two writers would take
   * turns clearing each other.
   *
   * Text is deliberately limited to a new box. Editing an existing one leaves
   * the original in the document, where it is still being drawn on everyone
   * else's static layer — a draft on top of it would read as the text doubled
   * rather than as it being changed.
   */
  // A new session starts empty. Cheaper than threading a reset through the
  // overlay's remount, and correct for the end of a session too, where there
  // is no overlay left to tell us anything.
  useEffect(() => {
    setLiveText('');
  }, [textEditingAt]);

  const draft = useMemo<Shape | null>(() => {
    if (newElement) return newElement;
    if (!textEditingAt || editingText || !liveText.trim()) return null;
    return createText({
      id: 'draft-text',
      x: textEditingAt.x,
      y: textEditingAt.y,
      text: liveText,
      strokeColor: itemStyle.strokeColor,
      opacity: itemStyle.opacity,
      fontFamily: itemStyle.fontFamily,
      fontSize: itemStyle.fontSize,
      textAlign: itemStyle.textAlign,
    });
  }, [newElement, textEditingAt, editingText, liveText, itemStyle]);

  // Published from the machine's own preview rather than the pointer handlers,
  // so every tool that draws something gets this for free — and so the draft
  // clears on whatever ends the gesture, commit or escape alike, without each
  // of those paths having to remember to say so.
  useEffect(() => {
    setDraft(draft);
  }, [draft, setDraft]);

  useEffect(() => {
    const sub1 = actorRef.on('shape.committed', (emitted) => {
      const shape = emitted.shape;

      if (isFrame(shape)) {
        // A frame drawn inside another belongs to it, exactly as any other
        // shape drawn there would. Without this the new frame lands loose on
        // the board and only ever gains contents, never a home.
        const parentId = frameForShape(shape, framesIn(doc.getShapes()));
        doc.addShape(parentId ? ({ ...shape, frameId: parentId } as Shape) : shape);
        // Drawing a frame around things is the plainest way to say what
        // belongs in it, so it has to take them in.
        for (const id of shapesCapturedBy(shape, doc.getShapes())) {
          doc.updateShape(id, { frameId: shape.id });
        }
        for (const id of membersHiddenByTheirFrame(doc.getShapes())) {
          doc.bringToFront(id);
        }
        return;
      }

      // Drawn inside a frame is drawn into it. Assigned before the shape
      // lands so it never exists unowned, which would flash unclipped.
      const frameId = frameForShape(shape, framesIn(doc.getShapes()));
      const placed = frameId ? ({ ...shape, frameId } as Shape) : shape;

      // An arrow drawn onto a shape keeps hold of it. Decided here rather than
      // during the gesture because it is the released ends that matter, and
      // they are not settled until the arrow is.
      const bindable = isArrow(placed) && bindArrowsRef.current;
      const bound = bindable ? attachArrowEnds(placed as ArrowShape, doc.getShapes()) : placed;
      doc.addShape(bound);

      // Settled straight away, so an arrow drawn across a shape stops at its
      // edge from the moment it is released rather than on the first drag.
      if (isArrow(bound) && (bound.startBinding || bound.endBinding)) {
        settleBoundArrowsInDocument(doc, new Set([bound.id]));
      }
    });
    const sub2 = actorRef.on('shapes.deleted', (emitted) => {
      // A frame goes with what is standing in it. One undo brings the whole
      // thing back, which is the only reading that matches deleting what
      // looks on screen like a single object.
      const going = withFrameMembers(emitted.ids, doc.getShapes());
      releaseArrowsFrom(doc, going);
      doc.deleteShapes(going);
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

  // The marquee is read on the frame it disappears, which is the frame the
  // gesture ended on. The index alone would answer with everything whose box
  // came near the marquee, so the shapes go through the hit test rather than
  // straight into the selection.
  const marqueeMode: MarqueeMode = preferences.values.selectOnWrap ? 'wrap' : 'overlap';
  const marqueeRef = useRef(marquee);
  useEffect(() => {
    if (marqueeRef.current && !marquee) {
      const finalMarquee = marqueeRef.current;
      const ids = hitTestMarquee(shapes, spatialIndex, finalMarquee, marqueeMode).map((s) => s.id);
      if (ids.length > 0) {
        actorRef.send({ type: 'SELECT_ALL', shapeIds: ids });
      }
    }
    marqueeRef.current = marquee;
  }, [marquee, shapes, spatialIndex, marqueeMode, actorRef]);

  /**
   * Measure what this gesture can line up with, leaving out what it is moving.
   *
   * Only what is on screen is measured, so a guide is never drawn to a shape
   * nobody can see and the cost of starting a drag follows the viewport rather
   * than the size of the board.
   */
  const measureSnapTargets = useCallback(
    (excluded: ReadonlySet<string>) => {
      snapTargetsRef.current = buildSnapTargets(
        shapes,
        excluded,
        worldViewport(camera, width, height),
        { midpoints: preferences.values.snapToMidpoints },
      );
    },
    [shapes, camera, width, height, preferences.values.snapToMidpoints],
  );

  /**
   * Snap a bare pointer position against whatever this gesture is drawing.
   *
   * The end of a line takes the nearest point outright, since it is aiming at
   * somewhere rather than lining up with something. A box corner is the other
   * case: each axis answers on its own, so a corner can take its x from one
   * neighbour and its y from another. Even spacing is not offered to either —
   * the shape is pinned at the corner the gesture started from and cannot
   * accept an offer to move bodily.
   */
  const snapForPointer = useCallback(
    (point: Point, tool: Tool) => {
      const threshold = snapThreshold(camera.zoom);
      if (DRAWS_AN_ENDPOINT.has(tool)) {
        return nearestTargetPoint(point, snapTargetsRef.current, threshold);
      }
      return resolveSnap({
        bounds: { x: point.x, y: point.y, width: 0, height: 0 },
        points: [point],
        targets: snapTargetsRef.current,
        threshold,
        gaps: false,
      });
    },
    [camera.zoom],
  );

  const handlePointerDown = useCallback(
    (
      point: Point,
      _screenPoint: Point,
      button: number,
      shiftKey: boolean,
      snapOverride = false,
    ) => {
      notifyActivity();

      // The laser never reaches the machine. It selects nothing, draws nothing,
      // and marks nothing for erasure — letting POINTER_DOWN through would only
      // give it a marquee it has no use for.
      if (activeTool === 'laser') {
        laser.begin(point.x, point.y);
        setLasering(true);
        return;
      }
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

      let hitShapeId: string | null = null;
      let hitHandle: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null = null;
      let hitVertex: VertexGrab | null = null;

      if (activeTool === 'select' && !isSpacePressed && button !== 1) {
        if (selectedIds.length === 1) {
          const selectedShape = shapes.find((s) => s.id === selectedIds[0]);
          if (selectedShape && hasPointHandles(selectedShape)) {
            const handle = shapeHandleAt(selectedShape, point.x, point.y, camera.zoom);
            if (handle) {
              const inserts = handle.type !== 'vertex';
              hitVertex = { index: handle.index, inserts };
              // The point a midpoint handle creates is made here rather than on
              // the first move, so that every frame of the drag rewrites the
              // same shape — one already carrying the new point — instead of
              // adding another one each time the pointer moves.
              const origin = inserts
                ? withHandlePointInserted(selectedShape, handle.index, handle.x, handle.y)
                : selectedShape;
              // An end being dragged has let go of whatever it was attached to
              // by the time it has moved at all. Left in place, the binding
              // would pull the end straight back to the shape it came from.
              vertexOriginRef.current = isArrow(origin)
                ? releasedEnd(origin, handle.index)
                : origin;
              vertexReleasedRef.current = false;
            }
          } else if (selectedShape) {
            hitHandle = hitTestHandles(selectedShape, point.x, point.y, camera.zoom);
            if (hitHandle !== null) {
              resizeOriginRef.current = selectedShape;
            }
          }
        }
        if (hitHandle === null && hitVertex === null) {
          const hit = hitTest(shapes, spatialIndex, point.x, point.y, camera.zoom);
          hitShapeId = hit?.id ?? null;

          if (hit) {
            const picked =
              shiftKey || selectedIds.includes(hit.id)
                ? [...new Set([...selectedIds, hit.id])]
                : [hit.id];
            // Dragging a frame drags what is standing in it. The members are
            // moved by the same loop as everything else, so the whole of
            // "a frame moves as one object" is this one expansion.
            const idsToMove = new Set(withFrameMembers(picked, shapes));
            const origins: Record<string, Shape> = {};
            for (const s of shapes) {
              if (idsToMove.has(s.id)) origins[s.id] = s;
            }
            dragOriginsRef.current = origins;
          }
        }
      }

      // Measured before the gesture moves anywhere, and always — the override
      // key can be pressed after a drag is under way, and by then the board has
      // already started moving underneath it.
      snapOverrideRef.current = snapOverride;

      let downPoint = point;
      if (activeTool === 'select' && hitVertex !== null && vertexOriginRef.current) {
        // No arrows to settle: an end being dragged has already let go, and
        // nothing can attach itself to a line or an arrow in the first place.
        measureSnapTargets(new Set([vertexOriginRef.current.id]));
        boundArrowsRef.current = EMPTY_IDS;
      } else if (activeTool === 'select' && hitHandle !== null && resizeOriginRef.current) {
        const moving = new Set([resizeOriginRef.current.id]);
        measureSnapTargets(moving);
        boundArrowsRef.current = affectedArrowIds(shapes, moving);
        gestureShapesRef.current = shapeMapFor(shapes, boundArrowsRef.current);
      } else if (activeTool === 'select' && hitShapeId) {
        const moving = new Set(Object.keys(dragOriginsRef.current));
        measureSnapTargets(moving);
        boundArrowsRef.current = affectedArrowIds(shapes, moving);
        gestureShapesRef.current = shapeMapFor(shapes, boundArrowsRef.current);
      } else if (DRAWS_FROM_POINTER.has(activeTool)) {
        measureSnapTargets(new Set<string>());
        boundArrowsRef.current = EMPTY_IDS;

        // The corner a shape is drawn out from is worth snapping too: a box
        // that starts flush with its neighbour needs no nudging afterwards.
        if (snappingActive(preferences.values.snapToObjects, snapOverride)) {
          const result = snapForPointer(point, activeTool);
          downPoint = { x: point.x + result.dx, y: point.y + result.dy };
        }
      } else {
        snapTargetsRef.current = NO_SNAP_TARGETS;
        boundArrowsRef.current = EMPTY_IDS;
      }
      showSnapGuides(EMPTY_GUIDES);
      pointerDownWorldRef.current = downPoint;

      actorRef.send({
        type: 'POINTER_DOWN',
        point: downPoint,
        button,
        shiftKey,
        hitShapeId,
        hitHandle,
        hitVertex,
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
      laser,
      setLasering,
      isSpacePressed,
      selectedIds,
      shapes,
      spatialIndex,
      camera.zoom,
      notifyActivity,
      measureSnapTargets,
      snapForPointer,
      showSnapGuides,
      preferences.values.snapToObjects,
    ],
  );

  const handlePointerMove = useCallback(
    (
      point: Point,
      _screenPoint: Point,
      screenDelta: Point,
      altKey = false,
      snapOverride = false,
    ) => {
      if (activeTool === 'laser') {
        // Only while the button is down. A laser tracks the cursor the way a
        // real one does — it is off until you press it.
        laser.extend(point.x, point.y);
        return;
      }

      snapOverrideRef.current = snapOverride;
      const snapping = snappingActive(preferences.values.snapToObjects, snapOverride);
      const threshold = snapThreshold(camera.zoom);

      // Read before the move is sent, because what the machine is doing decides
      // whether the point it is sent should have been moved first. A shape
      // being drawn is sized from the pointer, so the only place to snap it is
      // on the way in.
      let movePoint = point;
      if (actorRef.getSnapshot().matches('drawingShape')) {
        // Cleared as well as set, so letting the override key go mid-gesture
        // takes the guides down with it rather than leaving the last ones up.
        const result = snapping ? snapForPointer(point, activeTool) : NO_SNAP;
        movePoint = { x: point.x + result.dx, y: point.y + result.dy };
        showSnapGuides(result.guides);
      }

      actorRef.send({ type: 'POINTER_MOVE', point: movePoint, screenDelta });

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
        let dx = point.x - pointerDownWorldRef.current.x;
        let dy = point.y - pointerDownWorldRef.current.y;
        const origins = Object.values(dragOriginsRef.current);

        if (snapping && origins.length > 0) {
          // Everything is measured where the selection would land unsnapped:
          // the shapes have not moved yet, so their own geometry is a drag
          // behind and has to be carried forward by the same offset.
          const start = origins
            .map((origin) => shapeBounds(origin))
            .reduce((all, one) => unionRect(all, one));
          const bounds: Rect = { ...start, x: start.x + dx, y: start.y + dy };
          const points = dragSnapPoints(origins, start, preferences.values.snapToMidpoints).map(
            (snapPoint) => ({ x: snapPoint.x + dx, y: snapPoint.y + dy }),
          );

          const result = resolveSnap({
            bounds,
            points,
            targets: snapTargetsRef.current,
            threshold,
          });
          dx += result.dx;
          dy += result.dy;
          showSnapGuides(result.guides);
        } else {
          showSnapGuides(EMPTY_GUIDES);
        }

        const redrawingArrows = boundArrowsRef.current.size > 0;
        for (const [id, origin] of Object.entries(dragOriginsRef.current)) {
          const moved = { x: origin.x + dx, y: origin.y + dy };
          doc.updateShape(id, moved);
          if (redrawingArrows) {
            gestureShapesRef.current.set(id, { ...origin, ...moved });
          }
        }
        // After the shapes have moved, not before: an arrow works out where to
        // stop from where the shapes it is attached to are now.
        if (redrawingArrows) {
          settleBoundArrows(doc, gestureShapesRef.current, boundArrowsRef.current);
        }
      }

      const vertexOrigin = vertexOriginRef.current;
      const vertexGrab = snap.context.vertexGrab;
      if (
        snap.matches('draggingVertex') &&
        pointerDownWorldRef.current &&
        vertexOrigin &&
        vertexGrab &&
        hasPointHandles(vertexOrigin)
      ) {
        const from = vertexOrigin.points[vertexGrab.index]!;
        let x = vertexOrigin.x + from[0] + (point.x - pointerDownWorldRef.current.x);
        let y = vertexOrigin.y + from[1] + (point.y - pointerDownWorldRef.current.y);

        if (snapping) {
          // One point moves, so there is one point to line up and no box to
          // fit into a gap. Its own shape is not a target — that was left out
          // when the targets were measured — so an end cannot snap to the line
          // it is the end of.
          const result = resolveSnap({
            bounds: { x, y, width: 0, height: 0 },
            points: [{ x, y }],
            targets: snapTargetsRef.current,
            threshold,
            gaps: false,
          });
          x += result.dx;
          y += result.dy;
          showSnapGuides(result.guides);
        } else {
          showSnapGuides(EMPTY_GUIDES);
        }

        const moved = withHandlePointMoved(vertexOrigin, vertexGrab.index, x, y);
        const geometry = { x: moved.x, y: moved.y, points: moved.points };

        // The attachment is let go on the first move rather than on the press,
        // so that clicking an end without moving it leaves the arrow attached
        // to what it was attached to. Written once: every frame after this one
        // is geometry alone, and a board with other people on it feels every
        // needless write.
        const releasing = !vertexReleasedRef.current && isArrow(vertexOrigin);
        vertexReleasedRef.current = true;

        doc.updateShape(
          vertexOrigin.id,
          (releasing
            ? {
                ...geometry,
                startBinding: vertexOrigin.startBinding,
                endBinding: vertexOrigin.endBinding,
              }
            : geometry) as Partial<Shape>,
        );
      }

      if (
        snap.matches('resizingSelection') &&
        pointerDownWorldRef.current &&
        resizeOriginRef.current
      ) {
        let dx = point.x - pointerDownWorldRef.current.x;
        let dy = point.y - pointerDownWorldRef.current.y;
        const originalShape = resizeOriginRef.current;
        const handle = snap.context.resizeHandle;
        if (handle !== null) {
          if (snapping && resizeCanSnap(originalShape, handle)) {
            // Measured on the box the unsnapped drag produces, then the whole
            // resize is redone with the correction folded into the drag. Going
            // through the same function twice rather than adjusting the result
            // keeps every rule it enforces — the minimum size, the anchored
            // opposite corner — applying to what actually lands.
            const dragged = shapeBounds(resizeShape(originalShape, handle, dx, dy));
            // The mirrored handle once the box has turned inside out, so the
            // edges offered up are the ones the drag is actually moving.
            const { points, axes } = resizeSnapPoints(
              dragged,
              resizeSnapHandle(originalShape, handle, dx, dy),
            );
            const result = resolveSnap({
              bounds: dragged,
              points,
              targets: snapTargetsRef.current,
              threshold,
              axes,
              // A resize moves one edge, not the shape, so an offer to shift the
              // whole of it into a gap is not one this gesture can take.
              gaps: false,
            });
            dx += result.dx;
            dy += result.dy;
            showSnapGuides(result.guides);
          } else {
            showSnapGuides(EMPTY_GUIDES);
          }
          const resized = resizeShape(originalShape, handle, dx, dy);
          doc.updateShape(originalShape.id, resized);
          if (boundArrowsRef.current.size > 0) {
            gestureShapesRef.current.set(resized.id, resized);
            settleBoundArrows(doc, gestureShapesRef.current, boundArrowsRef.current);
          }
        }
      }
    },
    // shapes/spatialIndex/zoom feed the eraser hit-test; omitting them freezes
    // this callback on the first render's empty document.
    [
      actorRef,
      activeTool,
      laser,
      doc,
      shapes,
      spatialIndex,
      camera.zoom,
      preferences.values.snapToObjects,
      preferences.values.snapToMidpoints,
      snapForPointer,
      showSnapGuides,
    ],
  );

  /**
   * Every pointer position over the board, pressed or not.
   *
   * Two things want it: collaborators, who are shown where your pointer is,
   * and the handles that make a new point — those are drawn only once the
   * pointer has found one, and finding one is something you do before you
   * press anything, which is why this cannot live in the move handler.
   */
  const handlePointerHover = useCallback(
    (point: Point | null) => {
      setCursor(point);

      const onlySelected =
        point && activeTool === 'select' && selectedIds.length === 1
          ? shapes.find((s) => s.id === selectedIds[0])
          : undefined;
      setHoveredHandleId(
        onlySelected && hasPointHandles(onlySelected)
          ? (shapeHandleAt(onlySelected, point!.x, point!.y, camera.zoom)?.id ?? null)
          : null,
      );
    },
    [setCursor, activeTool, selectedIds, shapes, camera.zoom],
  );

  const handlePointerUp = useCallback(
    (point: Point) => {
      if (activeTool === 'laser') {
        laser.end();
        setLasering(false);
        return;
      }

      const snap = actorRef.getSnapshot();
      const draggedVertex = snap.matches('draggingVertex') && vertexReleasedRef.current;
      const wasInteracting =
        snap.matches('draggingSelection') || snap.matches('resizingSelection') || draggedVertex;

      // An end dropped on a shape takes hold of it, and one dropped on nothing
      // stays let go. Decided on release rather than during the drag for the
      // same reason a freshly drawn arrow is: it is where an end comes to rest
      // that says what it is pointing at.
      if (draggedVertex && vertexOriginRef.current && bindArrowsRef.current) {
        const current = doc.getShapes();
        const dragged = current.find((s) => s.id === vertexOriginRef.current!.id);
        if (dragged && isArrow(dragged)) {
          const rebound = reattachArrowEnds(dragged, current);
          doc.updateShape(dragged.id, {
            startBinding: rebound.startBinding,
            endBinding: rebound.endBinding,
          } as Partial<Shape>);
          settleBoundArrowsInDocument(doc, new Set([dragged.id]));
        }
      }

      // Membership settles on release, not during the gesture: recomputing it
      // every pointer move would write a change to the document each time a
      // shape crossed an edge, and a shape dragged across a frame on its way
      // somewhere else would join and leave it on the wire.
      if (wasInteracting) {
        const current = doc.getShapes();
        // Never a frame — a frame is resized, not edited point by point — so
        // the membership question below stays the ordinary one.
        const resized = resizeOriginRef.current ?? vertexOriginRef.current;
        const resizedFrame =
          resized && isFrame(resized)
            ? current.find((s): s is FrameShape => s.id === resized.id && isFrame(s))
            : undefined;

        // Three gestures, and the frame resize is the odd one out. A drag and
        // a shape resize both move a shape past frames that stayed still, so
        // both ask the ordinary question of whatever changed. Resizing a
        // frame is the reverse — the frame's own edges sweep across shapes
        // that stayed still — so it asks about the frame's contents instead.
        //
        // A resize leaves `dragOriginsRef` empty, which is why the resized
        // shape has to be named here: without it, resizing a shape out of a
        // frame would leave it a member of a frame it is no longer in.
        const changes = resizedFrame
          ? membershipAfterResize(resizedFrame, current)
          : assignmentsAfterMove(
              resized ? [resized.id] : Object.keys(dragOriginsRef.current),
              current,
            );

        for (const { id, frameId } of changes) {
          doc.updateShape(id, { frameId });
        }
        if (changes.length > 0) {
          for (const id of membersHiddenByTheirFrame(doc.getShapes())) {
            doc.bringToFront(id);
          }
        }
      }

      actorRef.send({ type: 'POINTER_UP', point });
      dragOriginsRef.current = {};
      resizeOriginRef.current = null;
      vertexOriginRef.current = null;
      vertexReleasedRef.current = false;
      pointerDownWorldRef.current = null;
      lastErasePointRef.current = null;
      snapTargetsRef.current = NO_SNAP_TARGETS;
      boundArrowsRef.current = EMPTY_IDS;
      showSnapGuides(EMPTY_GUIDES);

      // Break the undo group so the next drag/resize is a separate undo step
      if (wasInteracting) {
        doc.breakUndoGroup();
      }
    },
    [actorRef, activeTool, laser, setLasering, doc, showSnapGuides],
  );

  // Double-clicking a text shape (with any tool active) reopens it for editing.
  const handleDoubleClick = useCallback(
    (point: Point) => {
      // Frame labels first. They sit above the frame in space that otherwise
      // belongs to the board, so nothing else is competing for the gesture —
      // but a shape standing just above a frame would win a plain hit test.
      const labelled = frameLabelAt(framesIn(shapes), point.x, point.y, camera.zoom);
      if (labelled && !readOnly) {
        // Selected as well as opened, so the frame being renamed is outlined
        // while its name is in the field. Editing a label with nothing marking
        // out which frame it belongs to reads as a box floating on the board.
        actorRef.send({ type: 'SELECT_ALL', shapeIds: [labelled.id] });
        setRenamingFrameId(labelled.id);
        return;
      }

      const hit = hitTest(shapes, spatialIndex, point.x, point.y, camera.zoom);
      if (hit && isText(hit)) {
        actorRef.send({
          type: 'EDIT_TEXT_SHAPE',
          shapeId: hit.id,
          position: { x: hit.x, y: hit.y },
          existingText: hit.text,
        });
      }
    },
    [actorRef, shapes, spatialIndex, camera.zoom, readOnly],
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
      if (isPickerTool(tool)) {
        handlePickImage();
        return;
      }
      actorRef.send({ type: 'SELECT_TOOL', tool });
    },
    [actorRef, handlePickImage],
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
      // Nudging is a move like any other, so the arrows attached to what moved
      // have to come along — a shape walked across the board by the arrow keys
      // would otherwise leave them behind.
      settleBoundArrowsInDocument(doc, new Set(selectedIds));
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
    const current = doc.getShapes();

    // A frame copies with its contents, and lands clear of the original
    // rather than offset over it — so pressing duplicate repeatedly lays
    // frames out in a row instead of stacking them where none can be seen.
    const ids = withFrameMembers(selectedIds, current);
    const newIds = doc.duplicateShapes(ids, duplicateOffsetFor(selectedIds, current), genId);

    if (newIds.length > 0) {
      // Only the copied frames, not their contents: selecting everything
      // would make the next duplicate measure the members too.
      const copies = new Set(newIds);
      const frames = doc
        .getShapes()
        .filter((shape) => copies.has(shape.id) && isFrame(shape))
        .map((shape) => shape.id);
      actorRef.send({ type: 'SELECT_ALL', shapeIds: frames.length > 0 ? frames : newIds });
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

  // --- edits that also move the viewport ------------------------------------
  /**
   * Opening a file and resetting the canvas both move the viewport as well as
   * the document, so undoing either has to move the viewport back. Without
   * this the board is restored where it always was while the camera stays
   * parked somewhere else — which looks like an empty canvas, and reads as an
   * undo that didn't work.
   *
   * The edits are held by identity rather than by position in the undo stack:
   * a handle only matches the edit it came from, so later edits (which discard
   * the redo stack anyway) can never be mistaken for it.
   *
   * One slot, holding the most recent such edit. Undoing back past it loses
   * the pairing and leaves the camera alone, which is the honest outcome —
   * there is no second camera to put back that this ref still knows about.
   */
  const viewEditRef = useRef<{
    undoItem: object | null;
    redoItem: object | null;
    before: Camera;
    after: Camera;
  } | null>(null);

  // Fit the camera to what was just loaded and drop the old selection, which
  // points at shapes the replace has already removed.
  const handleBoardFileLoaded = useCallback(
    (loaded: readonly Shape[]) => {
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [] });

      // Read through the actor rather than the render-time value, so this is
      // the camera as it stands at the moment of the open.
      const before = actorRef.getSnapshot().context.camera;
      const rect = computeBoundingRect(loaded);
      const after = rect ? fitRectToViewport(rect, { width, height }, { maxZoom: 1 }) : before;
      if (rect) {
        actorRef.send({ type: 'SET_CAMERA', camera: after });
      }
      viewEditRef.current = {
        undoItem: doc.peekUndoItem(),
        redoItem: null,
        before,
        after,
      };
    },
    [actorRef, doc, width, height],
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
    const moved = viewEditRef.current;
    if (moved && undoing && undoing === moved.undoItem) {
      actorRef.send({ type: 'SET_CAMERA', camera: moved.before });
      // The redo of this undo is a fresh stack item; remember it so redoing
      // the edit takes the viewport forward again.
      moved.undoItem = null;
      moved.redoItem = doc.peekRedoItem();
    }
  }, [actorRef, doc]);

  const handleRedo = useCallback(() => {
    const redoing = doc.peekRedoItem();
    doc.redo();
    const moved = viewEditRef.current;
    if (moved && redoing && redoing === moved.redoItem) {
      actorRef.send({ type: 'SET_CAMERA', camera: moved.after });
      moved.redoItem = null;
      moved.undoItem = doc.peekUndoItem();
    }
  }, [actorRef, doc]);

  /**
   * Empty the board and put the view back where a new one starts.
   *
   * One `replaceShapes` transaction, so it lands as a single undo step that
   * also replicates: everyone in the room sees the board clear at once, and
   * whoever did it is one ⌘Z from putting it back. The undo group is broken on
   * both sides so the reset is its own step — the undo manager coalesces edits
   * within a second of each other, which is easily fast enough to swallow a
   * stroke drawn just before the reset, or one drawn just after it.
   *
   * The image cache is deliberately left alone. Board images are held by the
   * server and addressed by content, so dropping the decoded bitmaps would
   * only force a refetch of the very images an undo is about to ask for again.
   */
  const handleResetCanvas = useCallback(() => {
    // Read through the actor rather than the render-time value, so this is the
    // camera as it stands at the moment of the reset.
    const before = actorRef.getSnapshot().context.camera;

    const topBefore = doc.peekUndoItem();
    doc.breakUndoGroup();
    doc.replaceShapes([]);
    doc.breakUndoGroup();
    const topAfter = doc.peekUndoItem();

    // Escape rather than merely deselecting: it also abandons a half-drawn
    // shape and closes the text editor, either of which would otherwise be
    // left pointing at a shape the reset has just removed.
    actorRef.send({ type: 'ESCAPE' });
    setRenamingFrameId(null);
    actorRef.send({ type: 'SET_CAMERA', camera: IDENTITY_CAMERA });

    // An empty board has nothing to clear, so the transaction is empty and no
    // undo step is created — `peekUndoItem` would hand back whatever edit was
    // already on top. Pairing the camera with that one would drag the viewport
    // back here the next time an unrelated edit was undone, so the pairing is
    // only recorded when this reset genuinely made a step of its own. The
    // recentre is then simply not undoable, which is honest: nothing was lost.
    if (topAfter !== topBefore) {
      viewEditRef.current = {
        undoItem: topAfter,
        redoItem: null,
        before,
        after: IDENTITY_CAMERA,
      };
    }
  }, [actorRef, doc]);

  const confirmReset = useCallback(() => {
    setResetOpen(false);
    handleResetCanvas();
  }, [handleResetCanvas]);

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
    // Images first: a screenshot on the clipboard carries no text for the shape
    // reader to find, so checking text first would silently drop the paste.
    if (!readOnly) {
      const pastedImages = await readImagesFromClipboard();
      if (pastedImages.length > 0) {
        handleInsertImages(pastedImages);
        return;
      }
    }

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
  }, [doc, actorRef, readOnly, handleInsertImages]);

  const toggleGrid = useCallback(() => {
    preferences.set('showGrid', !preferences.values.showGrid);
  }, [preferences]);

  const toggleToolLock = useCallback(() => {
    preferences.set('toolLock', !preferences.values.toolLock);
  }, [preferences]);

  const toggleSnapping = useCallback(() => {
    preferences.set('snapToObjects', !preferences.values.snapToObjects);
  }, [preferences]);

  // The machine decides what happens when a tool finishes, so it has to hold
  // the preference rather than reach for it — same channel the item style
  // travels on.
  useEffect(() => {
    actorRef.send({ type: 'SET_TOOL_LOCK', locked: preferences.values.toolLock });
  }, [actorRef, preferences.values.toolLock]);

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
    onToggleGrid: toggleGrid,
    onToggleSnapping: toggleSnapping,
    onToggleToolLock: toggleToolLock,
    onOpenFile: openBoardFile,
    onSaveFile: saveBoardFileToDisk,
    onExportImage: showExport,
    onFind: search.openSearch,
    onCommandPalette: togglePalette,
    // The dialogs own the keyboard while they're up, so ⌘O can't stack a
    // second picker on top of an unanswered replace confirmation.
    //
    // The palette is in this list for a sharper reason than the rest: the
    // modifier combos below are matched before the typing check that would
    // otherwise spare them, so without it a ⌘S typed into the search field
    // would save the board instead of reaching the field.
    disabled:
      helpOpen ||
      exportOpen ||
      shareOpen ||
      settingsOpen ||
      paletteOpen ||
      resetOpen ||
      pendingReplace !== null ||
      notice !== null ||
      accessRevoked,
  });

  /**
   * Everything the palette can run. The handlers are the same ones the
   * keyboard already dispatches to, so a command cannot drift from the
   * shortcut that does the same thing.
   */
  const commands = useEditorCommands(
    {
      selectTool: handleToolChange,
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      zoomTo100: handleZoomTo100,
      zoomToFit: handleZoomToFit,
      zoomToSelection: handleZoomToSelection,
      toggleTheme,
      undo: handleUndo,
      redo: handleRedo,
      cut: handleCut,
      copy: handleCopy,
      paste: handlePaste,
      duplicate: handleDuplicate,
      deleteSelection: handleDelete,
      selectAll: handleSelectAll,
      bringForward: handleBringForward,
      sendBackward: handleSendBackward,
      bringToFront: handleBringToFront,
      sendToBack: handleSendToBack,
      open: openBoardFile,
      saveTo: saveBoardFileToDisk,
      exportImage: showExport,
      renameBoard: handleRenameBoard,
      liveCollaboration: showShare,
      copyLink: handleCopyBoardLink,
      resetCanvas: showReset,
      findOnCanvas: search.openSearch,
      help: handleShowHelp,
      settings: showSettings,
      signOut: showSignOut,
    },
    {
      readOnly,
      selectionCount: selectedIds.length,
      shapeCount: shapes.length,
      canUndo,
      canRedo,
      canRename,
    },
  );

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
        // The id travels with the commit so the machine can hold the new text
        // selected on its way back to select. Only for text that was just
        // made: editing an existing shape is not a tool finishing its work.
        actorRef.send({ type: 'COMMIT_TEXT', text, shapeId: textShape.id });
        return;
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
          theme={theme}
          onThemeChange={setTheme}
          surfaceTheme={presenceTheme}
          preferences={preferences}
          portalContainer={editorRoot}
          /* A menu item goes live by being given a handler here; anything
             without one renders disabled with a "Soon" badge, so the menu stays
             complete while the features behind it land. */
          actions={{
            renameBoard: canRename ? handleRenameBoard : null,
            open: openBoardFile,
            saveTo: saveBoardFileToDisk,
            exportImage: showExport,
            liveCollaboration: showShare,
            copyLink: handleCopyBoardLink,
            /* Live on an empty board too — it recentres the view as well as
               clearing, so it always does something. Null for a viewer, whose
               edits the document refuses anyway. */
            resetCanvas: readOnly ? null : showReset,
            commandPalette: togglePalette,
            findOnCanvas: search.openSearch,
            help: handleShowHelp,
            settings: showSettings,
            signOut: showSignOut,
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
              editingFrameIds={editingFrameIds}
              newElement={newElement}
              selectedIds={selectedIds}
              marquee={marquee}
              images={images.cache}
              imageRevision={images.revision}
              darkMode={resolvedTheme === 'dark'}
              onDropFiles={readOnly ? undefined : handleInsertImages}
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
              backgroundColor={canvasBackgroundFor(presenceTheme)}
              showGrid={preferences.values.showGrid}
              searchHighlights={search.highlights}
              snapGuides={snapGuides}
              hoveredHandleId={hoveredHandleId}
              peersRef={peersRef}
              subscribePeers={subscribe}
              onPointerHover={handlePointerHover}
            />

            {/* Laser trails, ours and everyone's. Outside CanvasStack for the
          same reason the cursors are, and painted by its own frame loop so a
          fading trail never re-renders the scene. */}
            <LaserLayer trails={laser} camera={camera} width={width} height={height} />

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
              {/* Above the bar, and not for viewers: it governs what happens
                  after a tool draws, and a viewer's tools never do. */}
              {!readOnly && (
                <ToolLockButton
                  activeTool={activeTool}
                  locked={preferences.values.toolLock}
                  onToggle={toggleToolLock}
                />
              )}
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
                  portalContainer={editorRoot}
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

            {frameNameEditor && (
              <FrameNameEditor
                key={frameNameEditor.frame.id}
                position={frameNameEditor.position}
                height={frameNameEditor.height}
                fontSize={frameNameEditor.fontSize}
                fontFamily={FRAME_LABEL_FONT_FAMILY}
                placeholder={DEFAULT_FRAME_NAME}
                initialName={frameNameEditor.frame.name}
                onCommit={handleCommitFrameName}
                onCancel={handleCancelFrameName}
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
                onChange={setLiveText}
              />
            )}

            <ZoomPanel
              zoom={camera.zoom}
              syncStatus={syncStatus}
              canZoomToFit={shapes.length > 0}
              canvasWidth={width}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onResetZoom={handleZoomTo100}
              onZoomToFit={handleZoomToFit}
            />

            <ShortcutsModal open={helpOpen} onClose={handleCloseHelp} theme={presenceTheme} />

            <ShareDialog
              open={shareOpen}
              onClose={hideShare}
              boardId={boardId}
              boardName={boardTitle}
              presenceKey={presenceKey}
              theme={presenceTheme}
              portalContainer={editorRoot}
            />

            <ConfirmDialog
              open={pendingReplace !== null}
              title="Replace board contents?"
              confirmLabel="Replace"
              destructive
              theme={presenceTheme}
              onConfirm={confirmReplace}
              onClose={cancelReplace}
            >
              Opening <strong>{pendingReplace?.fileName}</strong> replaces the {shapes.length} shape
              {shapes.length === 1 ? '' : 's'} on this board for everyone in it. You can undo this
              with ⌘Z.
            </ConfirmDialog>

            <ExportImageDialog
              open={exportOpen}
              onClose={hideExport}
              shapes={shapes}
              selectedShapes={selectedShapes}
              boardName={boardTitle}
              darkTheme={resolvedTheme === 'dark'}
              theme={presenceTheme}
              portalContainer={editorRoot}
              images={images.cache}
              resolveImageDataUrls={images.resolveDataUrls}
            />

            {/* On the settings dialog's surface rather than the editor's
                chrome: it stops the board to ask a question, which is the one
                other thing in the app that is not framing the canvas. */}
            <ConfirmDialog
              open={resetOpen}
              title="Reset the canvas?"
              confirmLabel="Reset"
              destructive
              theme={presenceTheme}
              onConfirm={confirmReset}
              onClose={hideReset}
            >
              {shapes.length > 0 ? (
                <>
                  This clears all {shapes.length} shape{shapes.length === 1 ? '' : 's'} from this
                  board for everyone in it, and returns the view to where a new board starts. You
                  can undo it with ⌘Z.
                </>
              ) : (
                // Nothing to discard, so nothing to warn about — but the row is
                // still live, and it still recentres the view.
                <>
                  This board is already empty, so this only returns the view to where a new board
                  starts.
                </>
              )}
            </ConfirmDialog>

            <ConfirmDialog
              open={notice !== null}
              title={notice?.title ?? ''}
              theme={presenceTheme}
              onClose={dismissNotice}
            >
              {notice?.body}
            </ConfirmDialog>

            <SignOutDialog
              open={signOutOpen}
              /* Held open while the navigation is in flight: Escape would
                 otherwise put the board back on screen for the moment before
                 the page goes, which reads as a sign-out that didn't take. */
              onOpenChange={(open) => {
                if (!signingOut) setSignOutOpen(open);
              }}
              name={user?.name ?? 'Account'}
              email={user?.email ?? null}
              isGuest={user?.isGuest ?? false}
              synced={syncStatus === 'connected'}
              busy={signingOut}
              onConfirm={() => {
                void handleSignOut();
              }}
              theme={presenceTheme}
            />

            {/* Mounted only while open: the fields inside hold unsaved edits,
                and closing the dialog is what discards them. */}
            {settingsOpen && (
              <SettingsDialog
                user={user && { name: user.name, email: user.email }}
                theme={presenceTheme}
                onClose={hideSettings}
              />
            )}

            <CommandPalette
              commands={commands}
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              portalContainer={editorRoot}
            />

            {/* Last, so it paints over every other dialog. Losing the board
                outranks whatever was being confirmed when it happened. */}
            <AccessRevokedDialog
              open={accessRevoked}
              boardName={boardTitle}
              isGuest={user?.isGuest ?? false}
              theme={presenceTheme}
            />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
