import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useActorRef, useSelector } from '@xstate/react';
import {
  arrowsAffectedBy,
  bindingFor,
  bindingTargetAt,
  boundArrowPatches,
  computeBoundingRect,
  createText,
  isArrow,
  arrowLabelAnchor,
  arrowLabelFont,
  arrowLabelOf,
  withBindingsCleared,
  type ArrowShape,
  type BoardDocument,
  DEFAULT_FRAME_NAME,
  fitRectToViewport,
  FRAME_LABEL_FONT_FAMILY,
  FRAME_LABEL_FONT_SIZE,
  fontSizeOf,
  frameForShape,
  frameLabelAt,
  frameLabelBounds,
  framesIn,
  hasPointHandles,
  hitTest,
  isFrame,
  isText,
  hiddenShapeIds,
  lockedShapeIds,
  lockSourcesOf,
  shapeHandleAt,
  visibleShapes,
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
  strokeColorFor,
  unionRect,
  type Camera,
  type FlipAxis,
  type Rect,
  type Shape,
  type ShapeUpdate,
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
  PASTE_HERE_NOTICE,
  PASTE_NOTICE,
  clipboardContentFrom,
  isPasteNotice,
  pastedTextWidth,
  readClipboardContent,
  readImagesFromClipboard,
  shapesCentredOn,
  withFreshIds,
  wrappedToWidth,
  writeShapesToClipboard,
  type CarriedPaste,
} from './clipboard';
import {
  LibraryMenu,
  draggedLibraryEntry,
  libraryItemName,
  libraryShapesFor,
  useLibrary,
  type LibraryEntry,
} from './library';
import { screenToWorld } from './pointer/coords';
import { useLastPointerPosition } from './pointer/useLastPointerPosition';
import { CanvasStack } from './canvas/CanvasStack';
import { pointerCursorValue } from './canvas/pointer-cursor';
import { useCameraPersistence } from './canvas/useCameraPersistence';
import { canvasBackgroundFor } from './properties/palette';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { useEdgeScroll } from './canvas/hooks/useEdgeScroll';
import { AppSidebar, readSidebarState } from './menu';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toolbar } from './toolbar/Toolbar';
import { HistoryPanel } from './toolbar/HistoryPanel';
import { ToolLockButton } from './toolbar/ToolLockButton';
import { GlassDock, GlassDockSeparator } from '@/components/ui/glass-dock';
import { TextEditor } from './text-editor/TextEditor';
import { ZoomPanel } from './zoom-panel/ZoomPanel';
import { ExitModeButton } from './modes/ExitModeButton';
import { toolMachine, resizeShape, resizeSnapHandle } from './machine/tool-machine';
import { useKeyboardShortcuts } from './tools/useKeyboardShortcuts';
import { CommandPalette, useEditorCommands } from './commands';
import {
  CanvasContextMenu,
  contextPressAt,
  type ContextMenuTarget,
  type MoveToBoards,
} from './context-menu';
import { hitTestHandles } from './selection/handles';
import { canFlipSelection, flipSelection } from './selection/flip-selection';
import { useBoardDocument, useYjsShapes } from './document/useYjsDocument';
import { useBoardImages, imageFilesFromDataTransfer, pickImageFiles } from './images';
import { LaserLayer, useLaserTrails } from './laser';
import {
  CommentsLayer,
  CommentsMenu,
  anchorPoint,
  commentTargetAt,
  isPinInView,
  mentionablePeople,
  useCommentPlacement,
  useComments,
  useUnreadThreads,
  type CommentThread,
} from './comments';
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
import { forgetOfflineCopies } from './sync/useOfflineCache';
import { useAuthToken } from './auth/useAuthToken';
import { SignOutDialog } from './auth/SignOutDialog';
import { signOutTo } from './auth/sign-out';
import { env } from './lib/env';
import { PropertiesPanel, StyleHalo, itemStyleFromShape } from './properties';
import type { ScreenRect } from './properties/halo-placement';
import { LinkBadges, LinkBox } from './links';
import { LockPadlock } from './lock/LockPadlock';
import { joinableFrames, lockToggleFor, unlockAllUpdates, withoutLocked } from './lock/lock-ops';
import {
  isLinkToThisBoard,
  readShapeLink,
  shapeLinkComplete,
  shapeLinkFor,
  shapeLinkRect,
  withoutShapeLink,
  type ShapeLinkTarget,
} from './links/shape-link';
import { StatsPanel, membershipAfterStatsEdit, type StatsPatch, type StatsProperty } from './stats';
import {
  TOOL_TO_SHAPE_KIND,
  VIEW_MODE_TOOL,
  VIEW_ONLY_TOOLS,
  isPickerTool,
  type Tool,
} from './tools/tool';
import {
  IDENTITY_CAMERA,
  newShapeScale,
  type HandleIndex,
  type ItemStyle,
  type Point,
  type VertexGrab,
} from './machine/tool-machine.types';
import { ShortcutsModal } from './help';
import { KeyCaps } from './help/KeyCaps';
import { FileInput, RotateCcw } from 'lucide-react';
import {
  clearStoredAuthTokens,
  decodeJwtUser,
  decodeJwtWorkspaceId,
  sessionResumeUrl,
} from './auth/token';
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
import {
  SettingsDialog,
  accountDeletedUrl,
  requestAccountDeletion,
  takeDeletionResume,
  type DeletionInput,
} from './settings';
import { warmAccountSecurity } from './settings/account-security-api';
import { usePreferences } from './preferences';
import { useAvatar, useAvatarUrls, useProfile } from './profile';
import { VerificationNotice } from './profile/VerificationNotice';
import { TermsNotice } from './profile/TermsNotice';

import { ConfirmDialog } from './ui';
import { NoticeDialog, type Notice } from './ui/NoticeDialog';
import { Toast, useToast } from './ui/Toast';

/** How far left of centre a thread's pin is put when the board has to be brought to it: about half the thread beside it. */
const THREAD_LEAD = 160;

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A link to shapes that have all gone from the board, opened or followed. */
const SHAPES_NOT_FOUND: Notice = {
  title: 'Shapes not found',
  body: 'The shapes this link points to are no longer on this board. They may have been deleted.',
  tone: 'warn',
};

/** One array, so "nothing is snapping" is the same value every time it is set. */
const EMPTY_GUIDES: readonly SnapGuide[] = [];

/** Likewise for "this gesture moves no bound arrows". */
const EMPTY_IDS: ReadonlySet<string> = new Set();

/**
 * How far, in screen pixels, a press on a locked shape may travel and still
 * be a click on it — which puts up its padlock — rather than the start of a
 * marquee drawn across it.
 */
const LOCK_CLICK_SLOP = 4;

/**
 * The screen delta of a move the pointer did not make — what an edge scroll
 * reports, having moved the board rather than the hand.
 */
const NO_SCREEN_DELTA: Point = { x: 0, y: 0 };

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

  // Nothing new attaches to a locked shape: an arrow attached to one is
  // locked with it, and one just drawn could not then be touched.
  // Nor to a hidden one, which nobody can see to aim at.
  const targets = withoutLocked(visibleShapes(shapes), lockedShapeIds(shapes));
  const startTarget = bindingTargetAt(targets, start, ARROW_BIND_MARGIN, arrow.id);
  const endTarget = bindingTargetAt(targets, end, ARROW_BIND_MARGIN, arrow.id);

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
    // An arrow following what it is attached to moves even when locked: the
    // lock holds it to that shape, and this is the shape moving it.
    doc.updateShape(patch.id, geometry as Partial<Shape>, { allowLocked: true });
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
    // Letting go of a shape that is going is bookkeeping, not an edit, and a
    // locked arrow has to let go as much as any other.
    doc.updateShape(
      shape.id,
      { startBinding: released.startBinding, endBinding: released.endBinding } as Partial<Shape>,
      { allowLocked: true },
    );
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

/**
 * The account the sidebar last showed, kept for as long as the tab is open.
 *
 * Every board mints its own token, and until the new one arrives there is no
 * one to name. Opening a board from the sidebar would otherwise blank the
 * account row for that moment on every switch.
 */
let lastChromeUser: { name: string; email: string | null; avatarUrl: string | null } | null = null;

export function Editor({ boardId }: EditorProps) {
  /** The editor root. Every popup portals here, for the theme tokens on it. */
  const editorRef = useRef<HTMLDivElement>(null);
  /** The space left of the sidebar: what the canvas fills and measures. */
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useCanvasResize(containerRef);
  const lastPointerPosition = useLastPointerPosition();
  /**
   * Where the next paste keystroke is to land, left by a menu's paste that
   * found nothing it was allowed to read — see `pasteFromMenu`. No point means
   * wherever a paste would go anyway.
   *
   * Given up as soon as "here" stops meaning what it did: a press on the
   * board, or the view moving under it.
   */
  const pasteTargetRef = useRef<{ at: Point | undefined } | null>(null);

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
  // Settings is opening at Delete account, because the person has just signed
  // in again in order to delete it.
  const [resumeDeletion, setResumeDeletion] = useState(false);
  /**
   * A request to delete the account is out, or has gone through.
   *
   * Every session ends as part of it, and the sync-server notices within
   * seconds — often before the answer to the request has even arrived. Its
   * "session ended" would send the browser to sign in over the top of the
   * page that says what happens next, so while this is set, being told the
   * session or the board is gone is expected rather than news.
   */
  const deletingAccountRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  /** Decided on the right-button press, so it is ready by the time the menu opens. */
  const [contextMenuTarget, setContextMenuTarget] = useState<ContextMenuTarget>('canvas');
  /**
   * The shape whose link field is open, or null. The link box shows the link
   * of any one linked shape selected; this is what makes it the field.
   */
  const [linkEditingId, setLinkEditingId] = useState<string | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  /** Where the floating style bar stands, for the link box to keep clear of. */
  const [haloRect, setHaloRect] = useState<ScreenRect | null>(null);
  /**
   * The locked shapes a click has just found, whose padlock is up: the ones
   * whose own lock is holding what was clicked. Null when none is.
   */
  const [activeLock, setActiveLock] = useState<readonly string[] | null>(null);
  /** A press on a locked shape, waiting to see whether it comes up as a click. */
  const lockPressRef = useRef<{ id: string; at: Point } | null>(null);
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
  const hideSettings = useCallback(() => {
    setSettingsOpen(false);
    setResumeDeletion(false);
  }, []);
  // Toggled rather than opened: the combo that summons it is the natural way
  // to dismiss it again, and pressing it twice should leave the board alone.
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  const showReset = useCallback(() => setResetOpen(true), []);
  const hideReset = useCallback(() => setResetOpen(false), []);
  /** Shared by the open and save flows — whichever has something to report. */
  // Carries its own heading: the open, save and copy-link flows all report
  // through here, and a shared dialog titled for only one of them mislabels
  // the other two.
  // Open, save and image notices only ever report what went wrong, or what was
  // skipped, so they carry the warning tone.
  const [notice, setNotice] = useState<Notice | null>(null);
  const toast = useToast();
  const dismissNotice = useCallback(() => setNotice(null), []);
  const showOpenNotice = useCallback(
    (body: string) => setNotice({ title: 'Open board', body, tone: 'warn' }),
    [],
  );
  const showSaveNotice = useCallback(
    (body: string) => setNotice({ title: 'Save board', body, tone: 'warn' }),
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
  // The account's own library, kept across boards. A guest has none.
  const library = useLibrary({ userId, token: authToken, isGuest: user?.isGuest ?? true });

  // Account & Security reads the account's sign-in methods and sessions from
  // the gateway, which takes a moment. Asked for once the board has settled,
  // so the tab has them the moment it opens. Once per page: the answer is kept.
  const accountAsked = user !== null && !user.isGuest;
  useEffect(() => {
    if (!accountAsked) return;
    const timer = setTimeout(() => warmAccountSecurity(authToken), 2500);
    return () => clearTimeout(timer);
  }, [accountAsked, authToken]);

  // Back from signing in again to delete the account: open straight at it.
  // The note is read once and is only honoured for the account that left it.
  useEffect(() => {
    if (!user || user.isGuest) return;
    if (takeDeletionResume(user.id)) {
      setResumeDeletion(true);
      setSettingsOpen(true);
    }
  }, [user]);

  /**
   * The account's own profile: the cursor colour this client publishes, and the
   * display name the settings dialog writes.
   *
   * A guest has no account behind their share link, so they are never asked for
   * one — the request would only come back 401.
   */
  const account = useProfile(user !== null && !user.isGuest, {
    // A saved name only reaches collaborators when the token carrying it is
    // reminted, so a rename asks for that at once rather than waiting for the
    // refresh already scheduled minutes out.
    onNameSaved: refreshAuthToken,
    // Re-read on every remint, so a change made elsewhere — another device,
    // beyond the reach of this browser's channel — lands without a reload.
    revalidateOn: authToken,
  });
  const cursorColor = account.profile?.cursorColor ?? null;

  /**
   * The photo this client publishes to the board, if any.
   *
   * Only one uploaded here. A sign-in provider's generated avatar stays out of
   * presence altogether: it is not a picture of anyone, and the coloured
   * initial it would replace says more.
   */
  const publishedAvatar = account.profile?.avatarUploaded ? account.profile.avatarVersion : null;

  /**
   * The account as this window shows it — the token's copy, and only that.
   *
   * The profile is the authority on what was saved, but it is loaded once and
   * never re-read, so preferring it here left a window that had not done the
   * saving showing a name the token had already replaced. The token is the one
   * copy that refreshes, and a save now prompts that refresh in every window
   * of this browser, so it is also the one that is current.
   */
  /**
   * This account's photo.
   *
   * Held here rather than in the settings dialog because the sidebar shows it
   * whether or not the dialog has ever been opened, and because the bytes live
   * in storage the gateway guards — so it takes the board's own token, and the
   * board it is being asked through.
   */
  const avatar = useAvatar({
    boardId,
    token: authToken,
    userId,
    version: account.profile?.avatarVersion ?? null,
    onChanged: account.reload,
  });

  const chromeUser = useMemo(
    () => (user ? { name: user.name, email: user.email, avatarUrl: avatar.url } : lastChromeUser),
    [user, avatar.url],
  );
  // A guest's identity is the share link's, not an account worth carrying to
  // the next board.
  useEffect(() => {
    if (user && !user.isGuest) lastChromeUser = chromeUser;
  }, [user, chromeUser]);

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
   *
   * View mode is the same rule, chosen rather than imposed: someone reading a
   * board they could edit, who would rather not knock anything while they do.
   * It rides on this one flag so that every gate below covers it too, and so
   * that leaving it is a matter of the flag going back down.
   */
  const viewMode = preferences.values.viewMode;
  const readOnly = accessRevoked || (user?.readOnly ?? true) || viewMode;
  /**
   * Both of the modes that put the chrome away, leaving the canvas and the one
   * button that brings it back. Focus mode keeps editing — by shortcut, since
   * the toolbar goes with everything else; view mode is the same screen with
   * `readOnly` on top and the hand as its only tool.
   */
  const chromeHidden = preferences.values.focusMode || viewMode;

  useEffect(() => {
    doc.setReadOnly(readOnly);
  }, [doc, readOnly]);
  const shapes = useYjsShapes(doc);
  const comments = useComments(doc);
  const commenting = useCommentPlacement();
  // Taken apart for the pointer handlers, which depend on these four and on
  // nothing else about it.
  const {
    begin: beginComment,
    follow: followComment,
    settle: settleComment,
    isPlacing: isPlacingComment,
  } = commenting;
  const { canUndo, canRedo } = useUndoState(doc);

  const {
    status: syncStatus,
    synced: boardSynced,
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
    onAccessRevoked: () => {
      if (!deletingAccountRef.current) setAccessRevoked(true);
    },
    // Signed out elsewhere, or the password was reset. The gateway's resume
    // route renews if the session is somehow still alive and otherwise lands
    // on sign-in, so this cannot strand anybody who is still signed in.
    onSessionEnded: () => {
      if (deletingAccountRef.current) return;
      window.location.href = sessionResumeUrl();
    },
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

  /**
   * Ask for the account to be deleted, and once it is, leave.
   *
   * A refusal — a wrong password, a sign-in too old — is thrown back to the
   * dialog, which says so, and everything carries on. Once it goes through,
   * every session the account had has ended, this one's included.
   *
   * Unlike signing out, nothing cached here is worth keeping then: with no
   * session left there is no way to send an unsynced edit anywhere, and the
   * boards it would belong to are going. So every copy this browser holds for
   * the account is discarded, and the browser leaves for the page that says
   * when the erasure runs. `replace`, so Back does not return to a dead board.
   */
  const deleteAccount = useCallback(
    async (input: DeletionInput) => {
      deletingAccountRef.current = true;
      let purgeAfter: string;
      try {
        ({ purgeAfter } = await requestAccountDeletion(authToken, input));
      } catch (error) {
        deletingAccountRef.current = false;
        throw error;
      }
      try {
        await purgeCache();
      } catch (err) {
        console.error('Failed to discard the cached board after deleting the account:', err);
      }
      if (userId) await forgetOfflineCopies(userId);
      clearStoredAuthTokens();
      window.location.replace(accountDeletedUrl(purgeAfter));
    },
    [authToken, purgeCache, userId],
  );

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
  // Two shapes can be open for typing, and they keep their words in different
  // places: a text shape is its text, an arrow only carries one.
  const editingText = editingTextShape && isText(editingTextShape) ? editingTextShape : null;
  const editingArrow = editingTextShape && isArrow(editingTextShape) ? editingTextShape : null;
  const editingTextInitialValue =
    editingText?.text ?? (editingArrow ? arrowLabelOf(editingArrow) : undefined);
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
  // A paste left waiting for its keystroke was aimed at a spot in this view.
  // Once the view has moved, that spot may be anywhere — off the screen as
  // likely as not.
  useEffect(() => {
    pasteTargetRef.current = null;
  }, [camera]);
  const restoreCamera = useCallback(
    (next: Camera) => actorRef.send({ type: 'SET_CAMERA', camera: next }),
    [actorRef],
  );
  // Reopen the board looking where it was left, rather than at the origin.
  const restoredViewRef = useCameraPersistence(boardId, camera, restoreCamera);
  const isSpacePressed = useSelector(actorRef, (s) => s.context.isSpacePressed);
  const selectedIds = useSelector(actorRef, (s) => s.context.selectedIds);
  const isIdle = useSelector(actorRef, (s) => s.matches('idle'));
  /**
   * What is locked — by its own flag, a locked frame around it, or for an
   * arrow a locked shape it is attached to — and the board without it, for
   * the gestures that pass over locked shapes: a click, a marquee, the eraser.
   */
  const lockedIds = useMemo(() => lockedShapeIds(shapes), [shapes]);
  /**
   * What is hidden — by its own flag or a hidden frame around it — and the
   * board without it: what is drawn, measured, snapped to and searched.
   */
  const hiddenIds = useMemo(() => hiddenShapeIds(shapes), [shapes]);
  const shownShapes = useMemo(() => visibleShapes(shapes), [shapes]);
  /** What a click, a marquee or the eraser can take: shown, and not locked. */
  const pickableShapes = useMemo(
    () => withoutLocked(shownShapes, lockedIds),
    [shownShapes, lockedIds],
  );
  /** The selection less what is locked: what an edit can actually change. */
  const editableIds = useMemo(
    () =>
      withoutLocked(
        selectedIds.map((id) => ({ id })),
        lockedIds,
      ).map(({ id }) => id),
    [selectedIds, lockedIds],
  );
  /** Something is selected and all of it is locked — picked out by a right-click. */
  const selectionLocked = selectedIds.length > 0 && editableIds.length === 0;
  const canFlip = useMemo(
    () => !readOnly && isIdle && canFlipSelection(editableIds, shapes),
    [readOnly, isIdle, editableIds, shapes],
  );
  const marquee = useSelector(actorRef, (s) => s.context.marquee);
  const itemStyle = useSelector(actorRef, (s) => s.context.itemStyle);
  const erasePending = useSelector(actorRef, (s) => s.context.erasePending);
  /**
   * The gestures that can carry the board along with them: the four that reach
   * for somewhere, rather than the ones that put something down where you are.
   *
   * Drawing is left out on purpose. A shape being sized from the pointer would
   * grow for as long as the board scrolled, and a freehand stroke would keep
   * laying down points in a line you were not drawing.
   */
  const isReachingGesture = useSelector(
    actorRef,
    (s) =>
      s.matches('draggingSelection') ||
      s.matches('resizingSelection') ||
      s.matches('draggingVertex') ||
      s.matches('marqueeSelecting'),
  );

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
    cursorColor,
    avatarVersion: publishedAvatar,
    activity,
    camera,
    screen,
    following: follow.following,
  });

  // Memoized because the hook resubscribes whenever this changes, and a fresh
  // object every render would have it do so on every render.
  // Your own row reads from the token like everyone else's does, so the name
  // beside your avatar is the one collaborators have.
  const rosterSelf = useMemo(
    () =>
      user
        ? { id: user.id, name: user.name, color: cursorColor, avatarVersion: publishedAvatar }
        : null,
    [user, cursorColor, publishedAvatar],
  );

  const { peersRef, subscribe, roster } = usePeerPresence({
    channel,
    self: rosterSelf,
    selfActivity: activity,
  });

  // Peers' trails are rebuilt from the cursor stream on their presence record,
  // so this reads the same roster the cursor layer does.
  const laser = useLaserTrails({
    peersRef,
    subscribe,
    userId,
    cursorColor,
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
        ? pointerCursorValue(presenceColorFor(userId, presenceTheme, cursorColor))
        : undefined,
    [collaborating, userId, presenceTheme, cursorColor],
  );

  // Whatever is open in the overlay is not also painted underneath it. An
  // arrow is more than its label, though: it keeps its line, and carries what
  // is being typed rather than what was last committed, so the gap the words
  // sit in grows under them as they are written.
  const shapesForRender = useMemo(() => {
    if (!editingTextShapeId) return shapes;
    return shapes.flatMap((shape) => {
      if (shape.id !== editingTextShapeId) return [shape];
      return isArrow(shape) ? [{ ...shape, label: liveText }] : [];
    });
  }, [shapes, editingTextShapeId, liveText]);

  // An arrow with its label open shows no selection chrome. The outline traces
  // the line, so it would run straight through the gap the caret is standing
  // in and put the whole of it back. Only what the layer paints: the selection
  // itself is untouched, so the panel still answers for the arrow and it is
  // still what a delete would take.
  const selectedIdsForRender = useMemo(
    () => (editingArrow ? selectedIds.filter((id) => id !== editingArrow.id) : selectedIds),
    [selectedIds, editingArrow],
  );

  const showImageNotice = useCallback(
    (body: string) => setNotice({ title: 'Image', body, tone: 'warn' }),
    [],
  );

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
  // The scale new text would be committed at, which the overlay has to preview
  // as well as the draft: with dynamic size on it cancels the zoom exactly, so
  // what is being typed stays at the size the panel says however far out the
  // board is.
  const newTextScale = newShapeScale(camera, preferences.values.dynamicSize);
  // Editing an existing shape shows that shape's own type; new text previews
  // the style the panel is set to. Either way the overlay is set the way the
  // commit will be, so nothing shifts at the moment it lands.
  const arrowLabelType = editingArrow ? arrowLabelFont(editingArrow) : null;
  const textEditorFontSize =
    (arrowLabelType?.fontSize ??
      (editingText ? fontSizeOf(editingText) : itemStyle.fontSize * newTextScale)) * camera.zoom;
  const textEditorFontFamily =
    arrowLabelType?.fontFamily ?? (editingText ? editingText.fontFamily : itemStyle.fontFamily);
  // Resolved for the board being typed on, so the caret's text is the colour
  // the shape takes the moment it is committed.
  const textEditorColor = strokeColorFor(
    editingArrow?.strokeColor ?? editingText?.strokeColor ?? itemStyle.strokeColor,
    resolvedTheme === 'dark',
  );

  // Rebuilt only when the marked set actually changes, so the static canvas
  // isn't invalidated on every pointer move of an eraser stroke.
  const pendingErasureIds = useMemo(() => new Set(erasePending), [erasePending]);

  const spatialIndex = useMemo(() => {
    const index = new SpatialIndex();
    index.rebuild(shapes);
    return index;
  }, [shapes]);

  // --- comments -----------------------------------------------------------
  // Who a comment written here is signed by: the token's copy of the account,
  // as the rest of this window shows it.
  const commentAuthor = useMemo(() => (user ? { id: user.id, name: user.name } : null), [user]);

  // Who a comment here can name with an @: whoever is on the board now, and
  // whoever has written or been named on it before. The full list of a board's
  // members is its owner's to see, so it is not what this is drawn from.
  const mentionable = useMemo(
    () =>
      mentionablePeople(
        roster.map((entry) => ({ id: entry.userId, name: entry.name })),
        comments.threads,
        userId,
      ),
    [roster, comments.threads, userId],
  );

  // Photos for everyone who has written on this board, for whoever is about
  // to, and for anyone who can be named. Asked for by id, so an author who is
  // no longer connected — or no longer on the board — still has their face
  // beside what they said.
  const commentPeople = useMemo(() => {
    const ids = new Set<string>(mentionable.map((person) => person.id));
    for (const thread of comments.threads) {
      for (const comment of thread.comments) ids.add(comment.authorId);
    }
    if (userId && !user?.isGuest) ids.add(userId);
    return [...ids].map((id) => ({ id }));
  }, [comments.threads, mentionable, userId, user?.isGuest]);
  const commentPhotos = useAvatarUrls({ boardId, token: authToken, subjects: commentPeople });
  const unreadThreads = useUnreadThreads(
    boardId,
    comments.threads,
    userId,
    commenting.openThreadId,
  );

  const commentTargetHere = useCallback(
    (point: Point) => commentTargetAt(point, shownShapes, spatialIndex, camera.zoom),
    [shownShapes, spatialIndex, camera.zoom],
  );

  // A comment posted is what the tool was picked up for, so it is put down.
  const finishCommenting = useCallback(() => {
    if (actorRef.getSnapshot().context.activeTool === 'comment') {
      actorRef.send({ type: 'SELECT_TOOL', tool: 'select' });
    }
  }, [actorRef]);

  // Picked from the list: open the thread at its pin. The board stays where it
  // is when the pin is already in view — moving a board someone is looking at,
  // to show them something they can see, reads as the board jumping. It is
  // only brought to a pin that is out of view, and then the pin is put left of
  // centre, so that the thread opening to its right sits in the middle of the
  // view rather than running off the edge of it.
  const { openThread: openCommentThread } = commenting;
  const showCommentThread = useCallback(
    (thread: CommentThread) => {
      if (!preferences.values.showComments) preferences.set('showComments', true);
      const point = anchorPoint(thread.anchor, new Map(shapes.map((shape) => [shape.id, shape])));
      const view = actorRef.getSnapshot().context.camera;
      const pin = { x: (point.x - view.x) * view.zoom, y: (point.y - view.y) * view.zoom };
      if (!isPinInView(pin, { width, height })) {
        actorRef.send({
          type: 'SET_CAMERA',
          camera: {
            x: point.x - (width / 2 - THREAD_LEAD) / view.zoom,
            y: point.y - height / 2 / view.zoom,
            zoom: view.zoom,
          },
        });
      }
      openCommentThread(thread.id);
    },
    [actorRef, shapes, width, height, preferences, openCommentThread],
  );

  // The composer belongs to the tool that opened it: switch away, and it goes
  // too. What was typed is kept for the next one.
  const { closePending } = commenting;
  useEffect(() => {
    if (activeTool !== 'comment') closePending();
  }, [activeTool, closePending]);

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
  // controls that silently no-op is worse than not offering them. Focus mode
  // puts it away with the rest of the chrome.
  //
  // Nor for a selection that is all locked: every control would be refused.
  const showProperties =
    !readOnly &&
    !chromeHidden &&
    (selectedShapes.length > 0 ? !selectionLocked : toolShapeKind !== null);

  /**
   * The selection's box in board pixels, for the floating style bar to sit
   * over. Follows every pan and zoom, since the camera is part of it.
   */
  const selectionOnBoard = useMemo(() => {
    const rect = computeBoundingRect(selectedShapes);
    if (!rect) return null;
    return {
      x: (rect.x - camera.x) * camera.zoom,
      y: (rect.y - camera.y) * camera.zoom,
      width: rect.width * camera.zoom,
      height: rect.height * camera.zoom,
    };
  }, [selectedShapes, camera]);

  // The one shape a link box can speak for. It shows that shape's link, or
  // the field for one, and steps aside while the shape is on the move or its
  // text is open — view mode selects nothing, so it never shows there.
  const linkShape = selectedShapes.length === 1 ? selectedShapes[0]! : null;
  const linkEditing = linkShape !== null && linkEditingId === linkShape.id && !readOnly;
  // The padlock a click on a locked shape put up, for as long as what it
  // stands for is still locked and still there to stand over. A viewer is
  // never offered one: unlocking is an edit.
  const padlock = useMemo(() => {
    if (!activeLock || readOnly || viewMode) return null;
    if (!activeLock.every((id) => lockedIds.has(id))) return null;
    const ids = new Set(activeLock);
    const rect = computeBoundingRect(shapes.filter((shape) => ids.has(shape.id)));
    if (!rect) return null;
    return {
      ids: activeLock,
      anchor: {
        x: (rect.x - camera.x) * camera.zoom,
        y: (rect.y - camera.y) * camera.zoom,
        width: rect.width * camera.zoom,
        height: rect.height * camera.zoom,
      },
    };
  }, [activeLock, readOnly, viewMode, lockedIds, shapes, camera]);

  const showLinkBox =
    linkShape !== null &&
    selectionOnBoard !== null &&
    !viewMode &&
    !isReachingGesture &&
    editingTextShapeId !== linkShape.id &&
    (linkEditing || Boolean(linkShape.link));

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
  /** Locked members of a frame being dragged, which go where it goes. */
  const carriedLockedRef = useRef<ReadonlySet<string>>(EMPTY_IDS);
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
   * Where the pointer last was on the canvas itself, in screen pixels.
   *
   * Screen and not world, because edge scrolling asks how close the pointer is
   * to the edge of the viewport — a question about the window, which a world
   * point stops being able to answer the moment the camera moves.
   */
  const lastCanvasPointRef = useRef<Point | null>(null);

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
  // A session starts holding whatever the overlay opens with, so an arrow
  // reopened for editing keeps the gap its existing label already had instead
  // of collapsing to a caret and springing back on the first keystroke. Read
  // through a ref because the value belongs to the session the effect is
  // starting, not to every render that changes it.
  const openingTextRef = useRef(editingTextInitialValue);
  openingTextRef.current = editingTextInitialValue;
  useEffect(() => {
    setLiveText(openingTextRef.current ?? '');
  }, [textEditingAt]);

  const draft = useMemo<Shape | null>(() => {
    if (newElement) return newElement;
    // Only a box being made from nothing: editing a shape that already exists
    // previews itself, on the shape.
    if (!textEditingAt || editingTextShapeId || !liveText.trim()) return null;
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
      scale: newTextScale,
    });
  }, [newElement, textEditingAt, editingTextShapeId, liveText, itemStyle, newTextScale]);

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
        const onBoard = doc.getShapes();
        const parentId = frameForShape(shape, joinableFrames(onBoard, lockedShapeIds(onBoard)));
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
      const onBoard = doc.getShapes();
      const frameId = frameForShape(shape, joinableFrames(onBoard, lockedShapeIds(onBoard)));
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
      const current = doc.getShapes();
      // Locked shapes stay, members of a deleted frame included. Left out
      // here as well as by the document, so no arrow lets go of a shape that
      // is not going and no comment is lifted off one.
      const locked = lockedShapeIds(current);
      const going = withFrameMembers(emitted.ids, current).filter((id) => !locked.has(id));
      if (going.length === 0) return;
      releaseArrowsFrom(doc, going);
      // A comment pinned to one of these stays on the board, where its shape
      // last was — and goes back onto the shape if the delete is undone.
      const shapesById = new Map(current.map((shape) => [shape.id, shape]));
      comments.store.holdPins(new Set(going), (thread) => anchorPoint(thread.anchor, shapesById));
      doc.deleteShapes(going);
    });
    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
    };
  }, [actorRef, doc, comments.store]);

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

  /**
   * The place this page was opened at, from a link to shapes on the board —
   * held until it has been gone to, or found to be gone. It outranks both the
   * view the board was left at and the fit below: someone who followed a
   * link wants what it points at.
   */
  const [arrivalLink, setArrivalLink] = useState<ShapeLinkTarget | null>(() =>
    readShapeLink(window.location.href),
  );

  useEffect(() => {
    if (!arrivalLink || width === 0 || height === 0) return;
    // Go as soon as every shape it names is here — usually from the copy kept
    // on this device, before the server has answered. Short of that, wait for
    // the board to arrive in full: only then is a missing shape really gone.
    if (!shapeLinkComplete(arrivalLink, shapes) && !boardSynced) return;

    setArrivalLink(null);
    // Off the address once used, so a reload returns to wherever the board
    // is left, and Copy board link copies the board rather than this place.
    window.history.replaceState(
      window.history.state,
      '',
      withoutShapeLink(window.location.href).href,
    );

    const rect = shapeLinkRect(arrivalLink, shownShapes);
    if (!rect) {
      setNotice(SHAPES_NOT_FOUND);
      return;
    }
    didInitialViewFitRef.current = true;
    actorRef.send({
      type: 'SET_CAMERA',
      camera: fitRectToViewport(rect, { width, height }, { maxZoom: 1 }),
    });
  }, [arrivalLink, shapes, shownShapes, boardSynced, width, height, actorRef]);

  useEffect(() => {
    if (didInitialViewFitRef.current) return;
    // A link to a place on the board decides the view instead, once it can.
    if (arrivalLink) return;
    // A board opened at the view it was left at is already looking where it
    // should be. Fitting on top of that would overrule the choice, and would
    // do it a beat late — after the content arrived, so as a visible jump.
    if (restoredViewRef.current) {
      didInitialViewFitRef.current = true;
      return;
    }
    // Wait for both the content and a measured viewport — fitting against a
    // zero-sized canvas would put the camera somewhere meaningless.
    if (shownShapes.length === 0 || width === 0 || height === 0) return;

    didInitialViewFitRef.current = true;

    const rect = computeBoundingRect(shownShapes);
    if (!rect) return;
    if (rectIntersectsViewport(rect, actorRef.getSnapshot().context.camera, { width, height })) {
      return;
    }
    actorRef.send({
      type: 'SET_CAMERA',
      camera: fitRectToViewport(rect, { width, height }, { maxZoom: 1 }),
    });
  }, [shownShapes, width, height, actorRef, restoredViewRef, arrivalLink]);

  // The marquee is read on the frame it disappears, which is the frame the
  // gesture ended on. The index alone would answer with everything whose box
  // came near the marquee, so the shapes go through the hit test rather than
  // straight into the selection.
  const marqueeMode: MarqueeMode = preferences.values.selectOnWrap ? 'wrap' : 'overlap';
  const marqueeRef = useRef(marquee);
  useEffect(() => {
    if (marqueeRef.current && !marquee) {
      const finalMarquee = marqueeRef.current;
      const ids = hitTestMarquee(pickableShapes, spatialIndex, finalMarquee, marqueeMode).map(
        (s) => s.id,
      );
      if (ids.length > 0) {
        actorRef.send({ type: 'SELECT_ALL', shapeIds: ids });
      }
    }
    marqueeRef.current = marquee;
  }, [marquee, pickableShapes, spatialIndex, marqueeMode, actorRef]);

  /**
   * Measure what this gesture can line up with, leaving out what it is moving.
   *
   * Only what is on screen is measured, so a guide is never drawn to a shape
   * nobody can see and the cost of starting a drag follows the viewport rather
   * than the size of the board.
   */
  const measureSnapTargets = useCallback(
    (excluded: ReadonlySet<string>) => {
      // Nothing lines up with a shape nobody can see.
      snapTargetsRef.current = buildSnapTargets(
        shownShapes,
        excluded,
        worldViewport(camera, width, height),
        { midpoints: preferences.values.snapToMidpoints },
      );
    },
    [shownShapes, camera, width, height, preferences.values.snapToMidpoints],
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
    (point: Point, screenPoint: Point, button: number, shiftKey: boolean, snapOverride = false) => {
      notifyActivity();
      lastCanvasPointRef.current = screenPoint;
      pasteTargetRef.current = null;

      // The laser never reaches the machine. It selects nothing, draws nothing,
      // and marks nothing for erasure — letting POINTER_DOWN through would only
      // give it a marquee it has no use for.
      if (activeTool === 'laser') {
        laser.begin(point.x, point.y);
        setLasering(true);
        return;
      }
      // Nor does a comment being placed: the press opens its composer, which
      // follows the pointer until the button comes up. Any other button is
      // left to pan the board as it would with any tool.
      if (activeTool === 'comment' && button === 0) {
        beginComment(point);
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

      // A press anywhere puts away the padlock a click on a locked shape put
      // up; the press below decides whether to put it back.
      setActiveLock(null);
      lockPressRef.current = null;
      carriedLockedRef.current = EMPTY_IDS;

      if (activeTool === 'select' && !isSpacePressed && button !== 1) {
        // A locked shape has no handles to take hold of.
        if (selectedIds.length === 1 && !lockedIds.has(selectedIds[0]!)) {
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
          // A locked shape is passed over for whatever is under it, as if it
          // were part of the board.
          const hit = hitTest(pickableShapes, spatialIndex, point.x, point.y, camera.zoom);
          hitShapeId = hit?.id ?? null;

          if (hit) {
            const picked = (
              shiftKey || selectedIds.includes(hit.id)
                ? [...new Set([...selectedIds, hit.id])]
                : [hit.id]
            ).filter((id) => !lockedIds.has(id));
            // Dragging a frame drags what is standing in it. The members are
            // moved by the same loop as everything else, so the whole of
            // "a frame moves as one object" is this one expansion.
            const idsToMove = new Set(withFrameMembers(picked, shapes));
            const origins: Record<string, Shape> = {};
            for (const s of shapes) {
              if (idsToMove.has(s.id)) origins[s.id] = s;
            }
            dragOriginsRef.current = origins;
            // A locked member goes where its frame goes. The frame is what is
            // being moved, and the lock is on the member's place in it.
            carriedLockedRef.current = new Set(
              Object.keys(origins).filter((id) => lockedIds.has(id)),
            );
          } else if (lockedIds.size > 0 && !readOnly) {
            // Nothing that can be picked up here. If a locked shape is, the
            // release below puts up its padlock — on a click, not a drag.
            const locked = hitTest(shownShapes, spatialIndex, point.x, point.y, camera.zoom);
            if (locked && lockedIds.has(locked.id)) {
              lockPressRef.current = { id: locked.id, at: screenPoint };
            }
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
          pickableShapes,
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
      beginComment,
      isSpacePressed,
      selectedIds,
      shapes,
      shownShapes,
      pickableShapes,
      lockedIds,
      readOnly,
      spatialIndex,
      camera.zoom,
      notifyActivity,
      measureSnapTargets,
      snapForPointer,
      showSnapGuides,
      preferences.values.snapToObjects,
    ],
  );

  /**
   * A right-button press: make the selection match what was clicked, and note
   * which menu that calls for. Nothing is sent to the machine as a pointer, so
   * the press starts no drag, marquee or stroke.
   */
  const handleContextPress = useCallback(
    (point: Point) => {
      notifyActivity();
      pasteTargetRef.current = null;
      // Commit an open text editor first, as a left press does, so the commit
      // cannot land after the selection below and take it over.
      if (actorRef.getSnapshot().matches('editingText')) {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement) {
          active.blur();
        }
      }
      // Nothing is selectable in view mode, so there is only the board's menu.
      if (viewMode) {
        setContextMenuTarget('canvas');
        return;
      }
      const press = contextPressAt(
        point,
        shownShapes,
        // Read through the actor: the commit above can have just changed it.
        actorRef.getSnapshot().context.selectedIds,
        spatialIndex,
        camera.zoom,
        lockedIds,
      );
      setActiveLock(null);
      if (press.select) actorRef.send({ type: 'SELECT_ALL', shapeIds: [...press.select] });
      setContextMenuTarget(press.target);
    },
    [actorRef, viewMode, shownShapes, lockedIds, spatialIndex, camera.zoom, notifyActivity],
  );

  /**
   * Refused mid-gesture. A right-click during a drag or a stroke belongs to
   * that gesture, and the menu's modal layer would take the pointer from it
   * halfway through. A touch long-press lands here too, since its press has
   * already started a gesture — so for now the menu is mouse and pen only.
   */
  const handleContextMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open && !actorRef.getSnapshot().matches('idle')) return;
      setContextMenuOpen(open);
    },
    [actorRef],
  );

  // Move to lists this workspace's boards, which the switcher has already
  // fetched for the rail. Moving itself waits on its own endpoint, so there is
  // no `onMove` yet and the rows read "Soon".
  const moveToBoards: MoveToBoards | null =
    boardSwitcher.available && boardSwitcher.workspaceId
      ? {
          workspaceName:
            boardSwitcher.workspaces?.find(
              (workspace) => workspace.id === boardSwitcher.workspaceId,
            )?.name ?? null,
          currentBoardId: boardId,
          boards: boardSwitcher.boardsFor(boardSwitcher.workspaceId),
        }
      : null;

  const handlePointerMove = useCallback(
    (
      point: Point,
      screenPoint: Point,
      screenDelta: Point,
      altKey = false,
      snapOverride = false,
    ) => {
      lastCanvasPointRef.current = screenPoint;

      if (activeTool === 'laser') {
        // Only while the button is down. A laser tracks the cursor the way a
        // real one does — it is off until you press it.
        laser.extend(point.x, point.y);
        return;
      }
      if (activeTool === 'comment' && isPlacingComment()) {
        followComment(point);
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
          pickableShapes,
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
        const updates: ShapeUpdate[] = [];
        for (const [id, origin] of Object.entries(dragOriginsRef.current)) {
          const moved = { x: origin.x + dx, y: origin.y + dy };
          updates.push({ id, patch: moved });
          if (redrawingArrows) {
            gestureShapesRef.current.set(id, { ...origin, ...moved });
          }
        }
        // One write for the lot, rather than one per shape: each write asks
        // the document what is locked, and a frame full of shapes is a lot of
        // asking for every frame of a drag.
        doc.updateShapes(updates, { allowLocked: carriedLockedRef.current });
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
    // The unlocked shapes, the index and the zoom feed the eraser hit-test;
    // omitting them freezes this callback on the first render's empty document.
    [
      actorRef,
      activeTool,
      laser,
      isPlacingComment,
      followComment,
      doc,
      pickableShapes,
      spatialIndex,
      camera.zoom,
      preferences.values.snapToObjects,
      preferences.values.snapToMidpoints,
      snapForPointer,
      showSnapGuides,
    ],
  );

  /**
   * One frame of a drag held against the edge of the canvas.
   *
   * Two things have to happen and the order matters. The camera moves first;
   * then the gesture is re-run against where the pointer now is in the world.
   * Every drag here measures itself from the world point under the pointer, and
   * moving the board moves that point even though the pointer itself has not
   * stirred — so without the second half the view would scroll away and leave
   * the shape behind.
   */
  const handleEdgeScroll = useCallback(
    (dx: number, dy: number) => {
      follow.notifyUserCameraInput();
      // PAN_BY carries the screen delta of a gesture and moves the camera
      // against it, so that the board follows your hand. This is the camera's
      // own movement rather than a hand to follow, and so goes in negated.
      actorRef.send({ type: 'PAN_BY', dx: -dx, dy: -dy });

      const screenPoint = lastCanvasPointRef.current;
      if (!screenPoint) return;
      // Read back out of the machine rather than from the rendered `camera`,
      // which is a React state update behind the pan just sent.
      const { camera: moved } = actorRef.getSnapshot().context;
      // The modifiers come from the last real pointer event rather than from
      // the defaults: no event is arriving to report them, and letting them
      // fall back to "not held" would take the snap override off — and arrow
      // binding back on — under a key the user is still holding down.
      handlePointerMove(
        { x: screenPoint.x / moved.zoom + moved.x, y: screenPoint.y / moved.zoom + moved.y },
        screenPoint,
        NO_SCREEN_DELTA,
        false,
        snapOverrideRef.current,
      );
    },
    [actorRef, follow, handlePointerMove],
  );

  // Not gated on `readOnly`. Read-only is enforced on the document, not on the
  // gesture, so a viewer can still pull a marquee — and this only moves a
  // camera they are already free to move.
  useEdgeScroll({
    active: isReachingGesture && preferences.values.edgeScrolling,
    width,
    height,
    pointRef: lastCanvasPointRef,
    onScroll: handleEdgeScroll,
  });

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
    (point: Point, screenPoint: Point) => {
      // A press on a locked shape that came up where it went down was a
      // click on it: the padlock goes up over whatever is holding it locked.
      const lockPress = lockPressRef.current;
      lockPressRef.current = null;
      if (
        lockPress &&
        Math.hypot(screenPoint.x - lockPress.at.x, screenPoint.y - lockPress.at.y) <=
          LOCK_CLICK_SLOP
      ) {
        setActiveLock(lockSourcesOf([lockPress.id], shapes));
      }

      // Before anything that can return early. A frame of edge scrolling can
      // still be queued behind this, and letting it read where the pointer was
      // would carry the board on after the gesture that asked for it ended.
      lastCanvasPointRef.current = null;

      if (activeTool === 'laser') {
        laser.end();
        setLasering(false);
        return;
      }
      if (activeTool === 'comment' && isPlacingComment()) {
        // Where the button comes up is where the pin goes: on the shape under
        // it, or on the board.
        settleComment(point, commentTargetAt(point, shownShapes, spatialIndex, camera.zoom));
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
      carriedLockedRef.current = EMPTY_IDS;
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
    [
      actorRef,
      activeTool,
      laser,
      setLasering,
      isPlacingComment,
      settleComment,
      shapes,
      shownShapes,
      spatialIndex,
      camera.zoom,
      doc,
      showSnapGuides,
    ],
  );

  // Double-pressing a text shape (with any tool active) reopens it for editing;
  // double-pressing anywhere else, with select in hand, starts a new one there.
  const handleDoubleClick = useCallback(
    (point: Point) => {
      if (readOnly) return;

      // Frame labels first. They sit above the frame in space that otherwise
      // belongs to the board, so nothing else is competing for the gesture —
      // but a shape standing just above a frame would win a plain hit test.
      // Neither a locked frame's name nor a locked shape's text opens: both
      // are edits, and a lock is there to keep them from happening.
      const labelled = frameLabelAt(framesIn(pickableShapes), point.x, point.y, camera.zoom);
      if (labelled) {
        // Selected as well as opened, so the frame being renamed is outlined
        // while its name is in the field. Editing a label with nothing marking
        // out which frame it belongs to reads as a box floating on the board.
        actorRef.send({ type: 'SELECT_ALL', shapeIds: [labelled.id] });
        setRenamingFrameId(labelled.id);
        return;
      }

      const hit = hitTest(pickableShapes, spatialIndex, point.x, point.y, camera.zoom);
      if (hit && isText(hit)) {
        actorRef.send({
          type: 'EDIT_TEXT_SHAPE',
          shapeId: hit.id,
          position: { x: hit.x, y: hit.y },
          existingText: hit.text,
        });
        return;
      }

      // An arrow is captioned rather than covered: the box opens in the break
      // in its line, centred on the same point the label will be drawn at,
      // whether or not it has one yet.
      if (hit && isArrow(hit)) {
        actorRef.send({
          type: 'EDIT_TEXT_SHAPE',
          shapeId: hit.id,
          position: arrowLabelAnchor(hit),
          existingText: arrowLabelOf(hit),
        });
        return;
      }

      /**
       * Everything else the gesture can land on — bare board, or anywhere
       * inside a shape or a frame — takes a new text box at the point pressed.
       * The box is free text sitting at that point rather than a label the
       * shape underneath owns, so it can be moved off afterwards like any
       * other text.
       *
       * Select only. Under a drawing tool the two presses have each already
       * drawn something, and putting a text box on top of that is not what the
       * gesture meant; the text tool makes a box on a single press, so a second
       * would only stack another on the first.
       */
      if (activeTool !== 'select') return;
      actorRef.send({ type: 'START_TEXT_AT', point });
    },
    [actorRef, pickableShapes, spatialIndex, camera.zoom, readOnly, activeTool],
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
      // The toolbar and the palette both drop these for a viewer; the keyboard
      // does not know to. Refused here rather than drawn and then refused by
      // the document, which would show the shape for a frame and take it back.
      if (readOnly && !VIEW_ONLY_TOOLS.has(tool)) return;
      if (viewMode && tool !== VIEW_MODE_TOOL) return;
      setActiveLock(null);
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
      // Picking up the comment tool with the pins hidden shows them: a pin
      // placed and not drawn would look like a comment that was lost.
      if (tool === 'comment' && !preferences.values.showComments) {
        preferences.set('showComments', true);
      }
      actorRef.send({ type: 'SELECT_TOOL', tool });
    },
    [actorRef, handlePickImage, readOnly, viewMode, preferences],
  );
  const handleEscape = useCallback(() => {
    setActiveLock(null);
    actorRef.send({ type: 'ESCAPE' });
    // The comment tool is put down by Escape, where the drawing tools stay in
    // hand: there is no half-drawn shape for the key to be cancelling instead.
    if (actorRef.getSnapshot().context.activeTool === 'comment') {
      actorRef.send({ type: 'SELECT_TOOL', tool: 'select' });
    }
  }, [actorRef]);
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
  // Nothing to delete in a selection that is all locked — and sending the
  // delete would still let go of the selection, as if something had gone.
  const handleDelete = useCallback(() => {
    if (editableIds.length === 0) return;
    actorRef.send({ type: 'DELETE_SELECTED' });
  }, [actorRef, editableIds]);
  const handleSelectAll = useCallback(() => {
    // Nothing is selectable in view mode, by the keyboard any more than by
    // the pointer.
    if (viewMode) return;
    // Locked shapes are left out, as a marquee leaves them out.
    actorRef.send({ type: 'SELECT_ALL', shapeIds: pickableShapes.map((s) => s.id) });
  }, [actorRef, pickableShapes, viewMode]);
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

  const handleFlip = useCallback(
    (axis: FlipAxis) => {
      const snapshot = actorRef.getSnapshot();
      if (readOnly || !snapshot.matches('idle')) return;
      // Locked shapes stay as they are, and so do the comments pinned to them.
      const ids = snapshot.context.selectedIds.filter((id) => !lockedIds.has(id));
      flipSelection(doc, ids, axis, ({ reflected, center }) =>
        comments.store.mirrorPins(reflected, axis, center),
      );
    },
    [actorRef, doc, readOnly, comments.store, lockedIds],
  );
  const handleFlipHorizontal = useCallback(() => handleFlip('horizontal'), [handleFlip]);
  const handleFlipVertical = useCallback(() => handleFlip('vertical'), [handleFlip]);

  /**
   * Add or edit the link of the one shape selected, by opening the link box
   * as a field. Pressed again while it is open, it puts the cursor back in it.
   */
  const handleEditLink = useCallback(() => {
    const snapshot = actorRef.getSnapshot();
    if (readOnly || !snapshot.matches('idle')) return;
    const ids = snapshot.context.selectedIds;
    if (ids.length !== 1 || lockedIds.has(ids[0]!)) return;
    setLinkEditingId(ids[0]!);
    linkInputRef.current?.focus();
  }, [actorRef, readOnly, lockedIds]);

  /**
   * Lock the selection, or unlock it when all of it is locked already.
   * Locking lets go of the selection — a locked shape is not one you go on
   * working on — and unlocking keeps it, ready to be worked on again.
   */
  const handleToggleLock = useCallback(() => {
    const snapshot = actorRef.getSnapshot();
    if (readOnly || !snapshot.matches('idle')) return;
    const ids = snapshot.context.selectedIds;
    const current = doc.getShapes();
    const { unlocking, updates } = lockToggleFor(ids, current, lockedShapeIds(current));
    if (updates.length === 0) return;
    doc.breakUndoGroup();
    doc.updateShapes(updates);
    doc.breakUndoGroup();
    setActiveLock(null);
    if (!unlocking) actorRef.send({ type: 'SELECT_ALL', shapeIds: [] });
  }, [actorRef, doc, readOnly]);

  /** Every lock on the board taken off, and what it freed selected to show what that was. */
  const handleUnlockAll = useCallback(() => {
    if (readOnly) return;
    const before = doc.getShapes();
    const freed = [...lockedShapeIds(before)];
    const updates = unlockAllUpdates(before);
    if (updates.length === 0) return;
    doc.breakUndoGroup();
    doc.updateShapes(updates);
    doc.breakUndoGroup();
    setActiveLock(null);
    actorRef.send({ type: 'SELECT_ALL', shapeIds: freed });
  }, [actorRef, doc, readOnly]);

  /** The padlock: what it stands for unlocked, and picked up ready to work on. */
  const handleUnlockFromPadlock = useCallback(() => {
    if (readOnly || !activeLock) return;
    doc.breakUndoGroup();
    doc.updateShapes(activeLock.map((id) => ({ id, patch: { locked: false } })));
    doc.breakUndoGroup();
    actorRef.send({ type: 'SELECT_ALL', shapeIds: [...activeLock] });
    setActiveLock(null);
  }, [actorRef, doc, readOnly, activeLock]);

  /**
   * Hide the selection, for everyone on the board, and let go of it: a shape
   * nobody can see cannot stay picked. Locked shapes too — hiding says
   * whether a shape is drawn, and leaves the shape itself as it was.
   */
  const handleHide = useCallback(() => {
    const snapshot = actorRef.getSnapshot();
    if (readOnly || !snapshot.matches('idle')) return;
    const ids = snapshot.context.selectedIds;
    if (ids.length === 0) return;
    doc.breakUndoGroup();
    doc.updateShapes(ids.map((id) => ({ id, patch: { hidden: true } })));
    doc.breakUndoGroup();
    setActiveLock(null);
    actorRef.send({ type: 'SELECT_ALL', shapeIds: [] });
  }, [actorRef, doc, readOnly]);

  /**
   * Every hidden shape shown again — the way back from Hide, there being no
   * list of hidden shapes to pick one from — and selected, so it is plain
   * what came back and where.
   */
  const handleShowAll = useCallback(() => {
    if (readOnly) return;
    const before = doc.getShapes();
    const revealed = [...hiddenShapeIds(before)];
    const updates = before
      .filter((shape) => shape.hidden === true)
      .map((shape) => ({ id: shape.id, patch: { hidden: false } }));
    if (updates.length === 0) return;
    doc.breakUndoGroup();
    doc.updateShapes(updates);
    doc.breakUndoGroup();
    setActiveLock(null);
    actorRef.send({ type: 'SELECT_ALL', shapeIds: revealed });
  }, [actorRef, doc, readOnly]);

  // A shape hidden while it is picked — by someone else on the board, or by
  // an undo — is let go of, as hiding it here would have.
  useEffect(() => {
    if (hiddenIds.size === 0) return;
    const kept = selectedIds.filter((id) => !hiddenIds.has(id));
    if (kept.length !== selectedIds.length) actorRef.send({ type: 'SELECT_ALL', shapeIds: kept });
  }, [hiddenIds, selectedIds, actorRef]);

  /** Store a link the box settled on — null takes it away — and close the field. */
  const handleSaveLink = useCallback(
    (id: string, link: string | null) => {
      setLinkEditingId((current) => (current === id ? null : current));
      const shape = doc.getShapes().find((s) => s.id === id);
      if (!shape || (shape.link ?? null) === link) return;
      // A step of its own in the history, never folded into a style change
      // made a moment before it.
      doc.breakUndoGroup();
      doc.updateShape(id, { link });
      doc.breakUndoGroup();
    },
    [doc],
  );

  const handleCancelLink = useCallback(() => setLinkEditingId(null), []);

  // The field belongs to the shape it was opened on. Selecting anything else,
  // or losing the right to edit, closes it.
  useEffect(() => {
    if (linkEditingId === null) return;
    if (readOnly || selectedIds.length !== 1 || selectedIds[0] !== linkEditingId) {
      setLinkEditingId(null);
    }
  }, [linkEditingId, readOnly, selectedIds]);

  // Add link leaves the cursor in the link field, rather than letting the menu
  // put it back on the board as it closes.
  const handleMenuCloseAutoFocus = useCallback((event: Event) => {
    if (!linkInputRef.current) return;
    event.preventDefault();
    linkInputRef.current.focus();
  }, []);

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
  // Fitted to what is drawn: a hidden shape far off would leave the board
  // zoomed out around empty space.
  const handleZoomToFit = useCallback(() => {
    const rect = computeBoundingRect(shownShapes);
    if (!rect) return; // No shapes to fit
    const newCamera = fitRectToViewport(rect, { width, height });
    actorRef.send({ type: 'SET_CAMERA', camera: newCamera });
  }, [actorRef, shownShapes, width, height]);

  // Zoom to selection (falls back to zoom-to-fit if nothing selected)
  const handleZoomToSelection = useCallback(() => {
    const target =
      selectedIds.length > 0 ? shownShapes.filter((s) => selectedIds.includes(s.id)) : shownShapes;
    const rect = computeBoundingRect(target);
    if (!rect) return;
    const newCamera = fitRectToViewport(rect, { width, height });
    actorRef.send({ type: 'SET_CAMERA', camera: newCamera });
  }, [actorRef, shownShapes, selectedIds, width, height]);

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
    shapes: shownShapes,
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

  // What the two questions say, held while they sink away on close: confirming
  // a reset empties the board, which would otherwise rewrite the question as
  // it leaves.
  const resetShapeCount = useRef(shapes.length);
  if (resetOpen) resetShapeCount.current = shapes.length;
  const lastReplace = useRef(pendingReplace);
  if (pendingReplace) lastReplace.current = pendingReplace;
  const replaceShapeCount = useRef(shapes.length);
  if (pendingReplace) replaceShapeCount.current = shapes.length;

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
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setNotice({
        title: 'Link copied',
        body: 'Anyone who already has access can open this board with it. To invite someone new, use Live collaboration.',
        tone: 'ok',
        link: { url, copied: true },
      });
    } catch {
      setNotice({
        title: 'Couldn’t copy the link',
        body: 'Your browser didn’t allow it. Copy the link from the address bar instead.',
        tone: 'warn',
        link: { url, copied: false },
      });
    }
  }, []);

  /**
   * Copy a link that opens this board with the selection in view, for anyone
   * who can already open the board. Said with a toast, which asks nothing and
   * goes by itself. A copy that failed still gets the notice, which shows the
   * link so it can be copied by hand.
   */
  const { show: showToast } = toast;
  const handleCopyLinkToSelection = useCallback(async () => {
    const selected = shapes.filter((shape) => selectedIds.includes(shape.id));
    if (selected.length === 0) return;
    const url = shapeLinkFor(window.location.href, selected);
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard');
    } catch {
      setNotice({
        title: 'Couldn’t copy the link',
        body: 'Your browser didn’t allow it. Copy the link below instead.',
        tone: 'warn',
        link: { url, copied: false },
      });
    }
  }, [shapes, selectedIds, showToast]);

  /**
   * Keep the selection in the account's library, named after what it says.
   * Said with a toast either way: what went in, what had to stay out, or why
   * none of it did.
   */
  const { enabled: libraryEnabled, add: addToLibrary, markUsed: markLibraryUsed } = library;
  const handleAddToLibrary = useCallback(async () => {
    if (!libraryEnabled || selectedIds.length === 0) return;
    const { shapes: kept, imagesLeftOut } = libraryShapesFor(selectedIds, shapes);
    if (kept.length === 0) {
      showToast(
        imagesLeftOut > 0 ? 'Images can’t go in the library yet' : 'Nothing to add',
        'warn',
      );
      return;
    }
    try {
      await addToLibrary(kept, libraryItemName(kept));
      showToast(
        imagesLeftOut === 0
          ? 'Added to library'
          : `Added to library, without ${imagesLeftOut === 1 ? 'the image' : `${imagesLeftOut} images`}`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t add that to your library', 'warn');
    }
  }, [libraryEnabled, addToLibrary, selectedIds, shapes, showToast]);

  /**
   * Put a library item on the board: in the middle of the view, or where it
   * was dropped. One undo step, and selected, as a paste is — the frames and
   * loose shapes, which bring what stands in the frames along.
   */
  const placeLibraryItem = useCallback(
    (entry: LibraryEntry, at?: Point) => {
      if (readOnly) return;
      const placed = shapesCentredOn(
        withFreshIds(entry.shapes, genId),
        at ?? viewportCentre(),
        doc.getShapes(),
      );
      if (placed.length === 0) return;
      doc.batch(() => {
        for (const shape of placed) doc.addShape(shape);
      });
      const ids = new Set(placed.map((shape) => shape.id));
      actorRef.send({
        type: 'SELECT_ALL',
        shapeIds: placed
          .filter((shape) => shape.frameId == null || !ids.has(shape.frameId))
          .map((shape) => shape.id),
      });
      markLibraryUsed(entry.id);
    },
    [readOnly, viewportCentre, doc, actorRef, markLibraryUsed],
  );

  // Whichever library it came from, the panel holds the item being dragged.
  const handleDropLibraryItem = useCallback(
    (id: string, at: Point) => {
      const entry = draggedLibraryEntry(id);
      if (entry) placeLibraryItem(entry, at);
    },
    [placeLibraryItem],
  );

  /**
   * A link to a place on this board, followed without leaving: the view moves
   * there, as it does when the board is opened at one. Answers whether it took
   * the link — anything else is left to the browser to open.
   */
  const handleFollowLink = useCallback(
    (link: string) => {
      if (!isLinkToThisBoard(link, window.location.href)) return false;
      const target = readShapeLink(link);
      if (!target) return false;
      const rect = shapeLinkRect(target, shownShapes);
      if (rect) {
        actorRef.send({
          type: 'SET_CAMERA',
          camera: fitRectToViewport(rect, { width, height }, { maxZoom: 1 }),
        });
      } else {
        setNotice(SHAPES_NOT_FOUND);
      }
      return true;
    },
    [actorRef, shownShapes, width, height],
  );

  // The notice's way to invite someone new: it gives way to the Share window.
  const shareFromNotice = useCallback(() => {
    setNotice(null);
    setShareOpen(true);
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
    // Delete via same event as Delete key — one undo step. Locked shapes are
    // copied and stay; with nothing else picked the cut is only a copy, and
    // the selection is kept rather than let go of for nothing.
    if (wroteOK && editableIds.length > 0) {
      actorRef.send({ type: 'DELETE_SELECTED' });
    }
  }, [shapes, selectedIds, editableIds, actorRef]);

  /**
   * Writing off the clipboard as a text shape, in the style new text is typed
   * in and wrapped to what fits the view.
   *
   * Left at the origin: it was copied from no place on the board, so where it
   * goes is for whoever pastes it to say.
   */
  const textShapeFromClipboard = useCallback(
    (text: string): Shape => {
      const { itemStyle, camera, dynamicSize } = actorRef.getSnapshot().context;
      const scale = newShapeScale(camera, dynamicSize);
      const blank = createText({
        id: genId(),
        x: 0,
        y: 0,
        text: '',
        strokeColor: itemStyle.strokeColor,
        opacity: itemStyle.opacity,
        fontFamily: itemStyle.fontFamily,
        fontSize: itemStyle.fontSize,
        textAlign: itemStyle.textAlign,
        scale,
      });
      // Measured as the shape itself will be, font and scale included, so a
      // line that is said to fit is one that is drawn fitting.
      const widthOf = (line: string) => shapeBounds({ ...blank, text: line }).width;
      const widest = pastedTextWidth(width, camera.zoom, scale);

      return { ...blank, text: wrappedToWidth(text, widest, widthOf) };
    },
    [actorRef, width],
  );

  /**
   * Put the clipboard on the board: beside what it was copied from, or — given
   * a point — with the middle of what arrives on that point.
   *
   * `carried` is what a paste keystroke brought with it, used in place of
   * asking for the clipboard. Resolves to whether there was anything to paste.
   */
  const pasteClipboard = useCallback(
    async (at?: Point, carried?: CarriedPaste): Promise<boolean> => {
      // Images first: a screenshot on the clipboard carries no text for the shape
      // reader to find, so checking text first would silently drop the paste.
      if (!readOnly) {
        const pastedImages = carried ? carried.images : await readImagesFromClipboard();
        if (pastedImages.length > 0) {
          handleInsertImages(pastedImages, at);
          return true;
        }
      }

      const content = carried
        ? clipboardContentFrom(carried.text, genId)
        : await readClipboardContent(genId);
      if (!content) return false;

      let placedShapes: Shape[];
      if (content.kind === 'text') {
        // Text was copied from nowhere on the board, so there is nothing to
        // land beside: without a point it goes in the middle of the view.
        placedShapes = shapesCentredOn(
          [textShapeFromClipboard(content.text)],
          at ?? viewportCentre(),
          doc.getShapes(),
        );
      } else if (at) {
        placedShapes = shapesCentredOn(content.shapes, at, doc.getShapes());
      } else {
        // With nowhere to aim for, offset each pasted shape 20px in both axes
        // so they're visually distinguishable from the originals
        const OFFSET = 20;
        placedShapes = content.shapes.map((s) => ({
          ...s,
          x: s.x + OFFSET,
          y: s.y + OFFSET,
        }));
      }

      // Add each shape via the document — each addShape assigns a fresh
      // fractional zIndex above current max, so pasted shapes land on top
      // in their original relative order
      for (const shape of placedShapes) {
        doc.addShape(shape);
      }

      // Auto-select the pasted shapes so user can immediately drag them
      actorRef.send({
        type: 'SELECT_ALL',
        shapeIds: placedShapes.map((s) => s.id),
      });
      return true;
    },
    [doc, actorRef, readOnly, handleInsertImages, textShapeFromClipboard, viewportCentre],
  );

  /**
   * Paste from a menu or the palette, which can only ask for the clipboard —
   * and are refused the one thing people most often copy outside a browser: a
   * file, from a folder. The browser hands that over on the paste keystroke
   * and nowhere else.
   *
   * So a paste that comes back with nothing says so, and waits: the keystroke
   * that follows lands where this one was meant to.
   */
  const pasteFromMenu = useCallback(
    async (at?: Point) => {
      pasteTargetRef.current = null;
      if (await pasteClipboard(at)) return;
      if (readOnly) return;

      pasteTargetRef.current = { at };
      setNotice(at ? PASTE_HERE_NOTICE : PASTE_NOTICE);
    },
    [pasteClipboard, readOnly],
  );

  const handlePaste = useCallback(() => pasteFromMenu(), [pasteFromMenu]);

  /**
   * Cmd/Ctrl+V. Read off the event there and then, since the browser empties
   * it as soon as the event is over, and landed where a menu's paste was left
   * waiting, if one was.
   */
  const handleKeyboardPaste = useCallback(
    (pasted: DataTransfer | null) => {
      const carried: CarriedPaste = {
        images: imageFilesFromDataTransfer(pasted),
        text: pasted?.getData('text/plain') ?? '',
      };
      const target = pasteTargetRef.current;
      pasteTargetRef.current = null;
      setNotice((shown) => (isPasteNotice(shown) ? null : shown));

      void pasteClipboard(target?.at, carried);
    },
    [pasteClipboard],
  );

  /**
   * Paste where the pointer is as the row is picked, rather than beside the
   * original.
   *
   * The point is taken before the clipboard is asked for anything: the browser
   * may stop to ask permission first, and the pointer goes on moving while it
   * does. A pointer that is not over the board — the row was picked from the
   * keyboard with the mouse resting on the sidebar — has no "here" to offer,
   * so the paste lands in the middle of the view instead of out of sight.
   */
  const handlePasteHere = useCallback(() => {
    const pointer = lastPointerPosition();
    const container = containerRef.current;
    let at = viewportCentre();

    if (pointer && container) {
      const rect = container.getBoundingClientRect();
      const overBoard =
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom;
      if (overBoard) at = screenToWorld(pointer.x, pointer.y, container, camera);
    }

    return pasteFromMenu(at);
  }, [lastPointerPosition, pasteFromMenu, camera, viewportCentre]);

  const toggleGrid = useCallback(() => {
    preferences.set('showGrid', !preferences.values.showGrid);
  }, [preferences]);

  const toggleToolLock = useCallback(() => {
    preferences.set('toolLock', !preferences.values.toolLock);
  }, [preferences]);

  const toggleSnapping = useCallback(() => {
    preferences.set('snapToObjects', !preferences.values.snapToObjects);
  }, [preferences]);

  const toggleMidpointSnapping = useCallback(() => {
    preferences.set('snapToMidpoints', !preferences.values.snapToMidpoints);
  }, [preferences]);

  const chooseInspector = useCallback(() => {
    preferences.set('floatingStyleBar', false);
  }, [preferences]);

  const chooseHalo = useCallback(() => {
    preferences.set('floatingStyleBar', true);
  }, [preferences]);

  const toggleArrowBinding = useCallback(() => {
    preferences.set('arrowBinding', !preferences.values.arrowBinding);
  }, [preferences]);

  const toggleFocusMode = useCallback(() => {
    preferences.set('focusMode', !preferences.values.focusMode);
  }, [preferences]);

  const toggleViewMode = useCallback(() => {
    preferences.set('viewMode', !preferences.values.viewMode);
  }, [preferences]);

  const toggleCanvasStats = useCallback(() => {
    preferences.set('canvasStats', !preferences.values.canvasStats);
  }, [preferences]);

  const toggleComments = useCallback(() => {
    preferences.set('showComments', !preferences.values.showComments);
  }, [preferences]);

  /**
   * Geometry from the stats panel, written as it arrives: once for a number
   * typed in, once for every step of a drag.
   *
   * A move or a resize from here is the same as one made with the pointer, so
   * the arrows attached to what changed are redrawn to follow it.
   */
  const handleStatsEdit = useCallback(
    (patches: readonly StatsPatch[]) => {
      for (const { id, patch } of patches) {
        doc.updateShape(id, patch as Partial<Shape>);
      }
      settleBoundArrowsInDocument(doc, new Set(patches.map((patch) => patch.id)));
    },
    [doc],
  );

  /**
   * The end of an edit from the stats panel. Frame membership settles here,
   * as it does on the release of a drag, and the edit becomes one undo step.
   */
  const handleStatsEditEnd = useCallback(
    (property: StatsProperty, ids: readonly string[]) => {
      const changes = membershipAfterStatsEdit(property, ids, doc.getShapes());
      for (const { id, frameId } of changes) {
        doc.updateShape(id, { frameId });
      }
      if (changes.length > 0) {
        for (const id of membersHiddenByTheirFrame(doc.getShapes())) {
          doc.bringToFront(id);
        }
      }
      doc.breakUndoGroup();
    },
    [doc],
  );

  // View mode outranks focus mode when both are on: it is the one that changes
  // what the canvas does, so it is the one to be shown and let go of first.
  const exitMode = useCallback(() => {
    if (preferences.values.viewMode) preferences.set('viewMode', false);
    else preferences.set('focusMode', false);
  }, [preferences]);

  // The machine decides what happens when a tool finishes, so it has to hold
  // the preference rather than reach for it — same channel the item style
  // travels on.
  useEffect(() => {
    actorRef.send({ type: 'SET_TOOL_LOCK', locked: preferences.values.toolLock });
  }, [actorRef, preferences.values.toolLock]);

  // Travels the same way, and for the same reason: the actions that make a
  // shape read it alongside the camera they already hold.
  useEffect(() => {
    actorRef.send({ type: 'SET_DYNAMIC_SIZE', enabled: preferences.values.dynamicSize });
  }, [actorRef, preferences.values.dynamicSize]);

  // Read-only takes the drawing tools off the toolbar; it has to take the one
  // in hand as well, or the next drag draws a shape the document then refuses.
  // View mode goes further and keeps only the hand, so that a press on the
  // canvas moves the board rather than outlining what is on it — whatever key
  // was pressed last, and whatever Escape hands back.
  useEffect(() => {
    if (viewMode) {
      if (activeTool !== VIEW_MODE_TOOL) {
        actorRef.send({ type: 'SELECT_TOOL', tool: VIEW_MODE_TOOL });
      }
    } else if (readOnly && !VIEW_ONLY_TOOLS.has(activeTool)) {
      actorRef.send({ type: 'SELECT_TOOL', tool: 'select' });
    }
  }, [actorRef, readOnly, viewMode, activeTool]);

  // Nothing stays outlined either: a selection is a promise of what the next
  // drag will move, and in view mode the next drag moves the board.
  useEffect(() => {
    if (viewMode) actorRef.send({ type: 'DESELECT' });
  }, [actorRef, viewMode]);

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
    onFlipHorizontal: handleFlipHorizontal,
    onFlipVertical: handleFlipVertical,
    onEditLink: handleEditLink,
    onToggleLock: handleToggleLock,
    onHide: handleHide,
    onZoomTo100: handleZoomTo100,
    onZoomToFit: handleZoomToFit,
    onZoomToSelection: handleZoomToSelection,
    onCopy: handleCopy,
    onCut: handleCut,
    onPaste: handleKeyboardPaste,
    onShowHelp: handleShowHelp,
    onToggleTheme: toggleTheme,
    onToggleGrid: toggleGrid,
    onToggleSnapping: toggleSnapping,
    onToggleToolLock: toggleToolLock,
    onToggleFocusMode: toggleFocusMode,
    onToggleViewMode: toggleViewMode,
    onToggleCanvasStats: toggleCanvasStats,
    onToggleComments: toggleComments,
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
      // The menu moves between its rows with the arrow keys, which would
      // otherwise nudge the selection it was opened on as well.
      contextMenuOpen ||
      resetOpen ||
      pendingReplace !== null ||
      notice !== null ||
      accessRevoked,
    // The notice that asks for the paste keystroke has to be able to get it.
    pasteWhileDisabled: isPasteNotice(notice),
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
      toggleFocusMode,
      toggleViewMode,
      toggleCanvasStats,
      toggleComments,
      undo: handleUndo,
      redo: handleRedo,
      cut: handleCut,
      copy: handleCopy,
      paste: handlePaste,
      duplicate: handleDuplicate,
      flipHorizontal: handleFlipHorizontal,
      flipVertical: handleFlipVertical,
      editLink: handleEditLink,
      copyLinkToSelection: handleCopyLinkToSelection,
      toggleLock: handleToggleLock,
      unlockAll: handleUnlockAll,
      hideSelection: handleHide,
      showAll: handleShowAll,
      addToLibrary: handleAddToLibrary,
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
      viewMode,
      selectionCount: selectedIds.length,
      editableSelectionCount: editableIds.length,
      canFlipSelection: canFlip,
      shapeCount: shapes.length,
      canUndo,
      canRedo,
      canRename,
      canUseLibrary: libraryEnabled,
    },
  );

  const handleCommitText = useCallback(
    (text: string) => {
      const snap = actorRef.getSnapshot();
      const pos = snap.context.textEditingAt;
      const editingId = snap.context.editingTextShapeId;
      const trimmed = text.trim();

      if (editingId) {
        const editing = doc.getShapes().find((shape) => shape.id === editingId);
        if (editing && isArrow(editing)) {
          // Trimmed, because a centred caption hangs off its own trailing
          // space — and emptied out it leaves the arrow, which was never the
          // label's to delete.
          doc.updateShape(editingId, { label: trimmed });
        } else if (trimmed) {
          doc.updateShape(editingId, { text });
        } else {
          // Editing an existing text shape down to empty deletes it.
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
          // From the machine rather than the render closure, so the text is
          // committed at the zoom the caret was actually placed at.
          scale: newShapeScale(snap.context.camera, snap.context.dynamicSize),
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

  /** What both style surfaces edit with — the docked panel and the floating bar alike. */
  const styleSurfaceProps = {
    style: propertyStyle,
    shapeKinds: propertyShapeKinds,
    canReorder: selectedIds.length === 1,
    onStyleChange: handleStyleChange,
    layerActions: {
      onSendToBack: handleSendToBack,
      onSendBackward: handleSendBackward,
      onBringForward: handleBringForward,
      onBringToFront: handleBringToFront,
    },
    darkMode: resolvedTheme === 'dark',
  };

  return (
    <div
      ref={editorRef}
      className="cf-editor"
      data-theme={resolvedTheme}
      // Read by global.css, which hides the sidebar on it. The chrome drawn
      // below is simply left out of the tree instead.
      data-chrome-hidden={chromeHidden ? '' : undefined}
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
          user={chromeUser}
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
            {/* Around the canvas alone, so a right-click on the chrome floating
                over it still gets the browser's own menu, or none. Rows go live
                by being given a handler here; the rest read "Soon". */}
            <CanvasContextMenu
              target={contextMenuTarget}
              readOnly={readOnly}
              moveTo={moveToBoards}
              open={contextMenuOpen}
              onOpenChange={handleContextMenuOpenChange}
              container={editorRoot}
              actions={{
                // Locked shapes can be copied and duplicated — the copies come
                // out unlocked — but nothing that would change them is offered.
                cut: editableIds.length > 0 ? handleCut : null,
                copy: selectedIds.length > 0 ? handleCopy : null,
                paste: handlePaste,
                pasteHere: handlePasteHere,
                duplicate: selectedIds.length > 0 ? handleDuplicate : null,
                flipHorizontal: canFlip ? handleFlipHorizontal : null,
                flipVertical: canFlip ? handleFlipVertical : null,
                // A link belongs to one shape, as its box does.
                addLink:
                  selectedIds.length === 1 && editableIds.length === 1 ? handleEditLink : null,
                copyLinkToSelection: selectedIds.length > 0 ? handleCopyLinkToSelection : null,
                // The account's, not the board's: a viewer may keep things too.
                addToLibrary: libraryEnabled && selectedIds.length > 0 ? handleAddToLibrary : null,
                exportImage: showExport,
                // The document reorders one shape at a time, so these wait
                // for a single selection — as the properties panel's do.
                bringToFront: editableIds.length === 1 ? handleBringToFront : null,
                bringForward: editableIds.length === 1 ? handleBringForward : null,
                sendBackward: editableIds.length === 1 ? handleSendBackward : null,
                sendToBack: editableIds.length === 1 ? handleSendToBack : null,
                lock: selectedIds.length > 0 ? handleToggleLock : null,
                unlockAll: shapes.length > 0 ? handleUnlockAll : null,
                hide: selectedIds.length > 0 ? handleHide : null,
                showAll: shapes.length > 0 ? handleShowAll : null,
                deleteSelection: editableIds.length > 0 ? handleDelete : null,
                selectAll: shapes.length > 0 ? handleSelectAll : null,
                showGrid: toggleGrid,
                snapToObjects: toggleSnapping,
                snapToMidpoints: toggleMidpointSnapping,
                arrowBinding: toggleArrowBinding,
                focusMode: toggleFocusMode,
                viewMode: toggleViewMode,
                canvasStats: toggleCanvasStats,
                showComments: toggleComments,
                commandPalette: togglePalette,
                stylePanelInspector: chooseInspector,
                stylePanelHalo: chooseHalo,
              }}
              checks={{
                showGrid: preferences.values.showGrid,
                snapToObjects: preferences.values.snapToObjects,
                snapToMidpoints: preferences.values.snapToMidpoints,
                arrowBinding: preferences.values.arrowBinding,
                focusMode: preferences.values.focusMode,
                viewMode,
                canvasStats: preferences.values.canvasStats,
                showComments: preferences.values.showComments,
                stylePanelInspector: !preferences.values.floatingStyleBar,
                stylePanelHalo: preferences.values.floatingStyleBar,
              }}
              labels={{
                addLink: linkShape?.link ? 'Edit link' : 'Add link',
                lock: selectionLocked ? 'Unlock' : 'Lock',
              }}
              onCloseAutoFocus={handleMenuCloseAutoFocus}
            >
              {/* Filling the container, as CanvasStack did before it was
                  wrapped, so the canvas still sizes to the space it has. */}
              <div className="absolute inset-0">
                <CanvasStack
                  shapes={shapesForRender}
                  pendingErasureIds={pendingErasureIds}
                  editingFrameIds={editingFrameIds}
                  editingArrowLabelId={editingArrow?.id}
                  newElement={newElement}
                  selectedIds={selectedIdsForRender}
                  marquee={marquee}
                  images={images.cache}
                  imageRevision={images.revision}
                  darkMode={resolvedTheme === 'dark'}
                  onDropFiles={readOnly ? undefined : handleInsertImages}
                  onDropLibraryItem={readOnly ? undefined : handleDropLibraryItem}
                  activeTool={activeTool}
                  camera={camera}
                  isSpacePressed={isSpacePressed}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onContextPress={handleContextPress}
                  onDoubleClick={handleDoubleClick}
                  onWheelZoom={handleWheelZoom}
                  onWheelPan={handleWheelPan}
                  isPanning={isPanning}
                  backgroundColor={canvasBackgroundFor(presenceTheme)}
                  showGrid={preferences.values.showGrid}
                  searchHighlights={search.highlights}
                  snapGuides={snapGuides}
                  hoveredHandleId={hoveredHandleId}
                  lockedIds={lockedIds}
                  lockHighlightIds={padlock ? padlock.ids : undefined}
                  peersRef={peersRef}
                  subscribePeers={subscribe}
                  onPointerHover={handlePointerHover}
                />
              </div>
            </CanvasContextMenu>

            {/* A badge on the corner of every linked shape on screen, which
                opens its link. Under the comment pins, and still up with the
                chrome away — a link is part of what is on the board. */}
            <LinkBadges
              shapes={shownShapes}
              camera={camera}
              board={screen}
              except={selectedIds.length === 1 ? selectedIds[0]! : null}
              onFollow={handleFollowLink}
            />

            {/* Comments: a pin for every thread, and what opens from one. Drawn
                before the laser and the cursors so both pass over the pins.
                Still up with the chrome away — a comment is part of what is
                on the board, not part of the frame around it. */}
            {preferences.values.showComments && (
              <CommentsLayer
                threads={comments.threads}
                unread={unreadThreads}
                store={comments.store}
                shapes={shapes}
                camera={camera}
                board={screen}
                user={commentAuthor}
                canComment={!readOnly && commentAuthor !== null}
                photos={commentPhotos}
                theme={presenceTheme}
                people={mentionable}
                container={editorRoot}
                pending={commenting.pending}
                openThreadId={commenting.openThreadId}
                onOpenThread={commenting.openThread}
                onClosePending={commenting.closePending}
                onPosted={finishCommenting}
                targetAt={commentTargetHere}
              />
            )}

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
                color={followedPeer.color}
                theme={presenceTheme}
                onStop={follow.stop}
              />
            )}

            {/* Top-right chrome shares one axis; the dock places them so neither
          child has to know the other's width.

          With the chrome away this corner is the one thing left on screen: the
          way out stands exactly where the share button stands the rest of the
          time. ⌘F still has to land somewhere, so the search comes up on its
          own for as long as it is in use and leaves on Escape like the rest. */}
            <div className="cf-top-right-dock">
              {!chromeHidden && libraryEnabled && (
                <LibraryMenu
                  library={library}
                  darkMode={resolvedTheme === 'dark'}
                  canAdd={selectedIds.length > 0}
                  canPlace={!readOnly}
                  onAdd={handleAddToLibrary}
                  onPlace={placeLibraryItem}
                  onNotify={showToast}
                  container={editorRoot}
                />
              )}
              {!chromeHidden && (
                <CommentsMenu
                  threads={comments.threads}
                  photos={commentPhotos}
                  theme={presenceTheme}
                  openThreadId={commenting.openThreadId}
                  onSelect={showCommentThread}
                  container={editorRoot}
                />
              )}
              {(!chromeHidden || search.open) && <FindBar search={search} />}
              {chromeHidden ? (
                <ExitModeButton mode={viewMode ? 'view' : 'focus'} onExit={exitMode} />
              ) : (
                <PeerList
                  roster={roster}
                  boardId={boardId}
                  authToken={authToken}
                  theme={presenceTheme}
                  following={follow.following}
                  onFollow={follow.follow}
                  onStopFollowing={follow.stop}
                  onShare={showShare}
                  readOnly={readOnly}
                  portalContainer={editorRoot}
                />
              )}
            </div>

            {/* Opens the sidebar on a phone, where it is a sheet that leaves no
          rail behind to open it from. Wider, the sidebar's own button beside
          the workspace does this, so the canvas corner stays clear. Gone
          with the rest of the chrome once it is away. */}
            {!chromeHidden && (
              <SidebarTrigger className="absolute top-4 left-4 z-(--zIndex-layerUI) md:hidden" />
            )}

            {/* The dock goes with the rest of the chrome. The tools themselves
                do not — every one keeps its key, see useKeyboardShortcuts. */}
            {!chromeHidden && (
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
            )}

            {/* Two ways to set out the same controls, chosen in preferences: a
                panel docked at the right edge, or a bar floating over the
                selection that steps aside while the selection is dragged. */}
            {showProperties &&
              (preferences.values.floatingStyleBar ? (
                <StyleHalo
                  {...styleSurfaceProps}
                  anchor={selectionOnBoard}
                  board={screen}
                  hidden={isReachingGesture}
                  onPlace={setHaloRect}
                />
              ) : (
                <PropertiesPanel {...styleSurfaceProps} />
              ))}

            {/* The selected shape's link, or the field to add one, by the
                selection and clear of the floating style bar. A viewer sees
                the link without the controls that change it. */}
            {showLinkBox && linkShape && selectionOnBoard && (
              <LinkBox
                key={linkShape.id}
                link={linkShape.link ?? null}
                editing={linkEditing}
                // A locked shape's link can be opened and copied, not changed.
                readOnly={readOnly || lockedIds.has(linkShape.id)}
                anchor={selectionOnBoard}
                board={screen}
                avoid={haloRect}
                inputRef={linkInputRef}
                onEdit={handleEditLink}
                onSave={(link) => handleSaveLink(linkShape.id, link)}
                onCancel={handleCancelLink}
                onFollow={handleFollowLink}
              />
            )}

            {/* Over a locked shape someone has just clicked: why nothing was
                picked, and the way back in. */}
            {padlock && (
              <LockPadlock
                anchor={padlock.anchor}
                board={screen}
                onUnlock={handleUnlockFromPadlock}
              />
            )}

            {/* The numbers behind the board, as a strip in the bottom-left
                corner — the one stretch of that edge the dock and the zoom
                panel leave free. Away with the rest of the chrome in focus
                and view mode. A viewer may read them. */}
            {preferences.values.canvasStats && !chromeHidden && (
              <StatsPanel
                shapes={shownShapes}
                selectedShapes={selectedShapes}
                // A locked selection can be read here, not changed.
                readOnly={readOnly || selectionLocked}
                boardWidth={width}
                onEdit={handleStatsEdit}
                onEditEnd={handleStatsEditEnd}
                onClose={toggleCanvasStats}
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
                align={editingArrow ? 'center' : 'left'}
                fontSize={textEditorFontSize}
                fontFamily={textEditorFontFamily}
                color={textEditorColor}
                initialText={editingTextInitialValue}
                onCommit={handleCommitText}
                onCancel={handleCancelText}
                onChange={setLiveText}
              />
            )}

            {!chromeHidden && (
              <ZoomPanel
                zoom={camera.zoom}
                syncStatus={syncStatus}
                canZoomToFit={shownShapes.length > 0}
                canvasWidth={width}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onResetZoom={handleZoomTo100}
                onZoomToFit={handleZoomToFit}
              />
            )}

            {/* Just above the zoom panel, or in its corner while it is away. */}
            <Toast toast={toast.toast} />

            <ShortcutsModal open={helpOpen} onClose={handleCloseHelp} theme={presenceTheme} />

            <ShareDialog
              open={shareOpen}
              onClose={hideShare}
              boardId={boardId}
              boardName={boardTitle}
              userId={userId}
              presenceKey={presenceKey}
              authToken={authToken}
              theme={presenceTheme}
            />

            <ConfirmDialog
              open={pendingReplace !== null}
              title="Replace board contents?"
              confirmLabel="Replace"
              destructive
              icon={<FileInput aria-hidden="true" />}
              theme={presenceTheme}
              onConfirm={confirmReplace}
              onClose={cancelReplace}
            >
              Opening <strong>{lastReplace.current?.fileName}</strong> replaces the{' '}
              {replaceShapeCount.current} shape{replaceShapeCount.current === 1 ? '' : 's'} on this
              board for everyone in it. You can undo this with <KeyCaps keys="mod+z" size="sm" />.
            </ConfirmDialog>

            <ExportImageDialog
              open={exportOpen}
              onClose={hideExport}
              shapes={shownShapes}
              selectedShapes={selectedShapes}
              boardName={boardTitle}
              darkTheme={resolvedTheme === 'dark'}
              theme={presenceTheme}
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
              // Nothing to discard on an empty board, so nothing dressed as
              // discarding — but the row is still live, and it still
              // recentres the view.
              destructive={resetShapeCount.current > 0}
              icon={<RotateCcw aria-hidden="true" />}
              theme={presenceTheme}
              onConfirm={confirmReset}
              onClose={hideReset}
            >
              {resetShapeCount.current > 0 ? (
                <>
                  This clears all {resetShapeCount.current} shape
                  {resetShapeCount.current === 1 ? '' : 's'} from this board for everyone in it, and
                  returns the view to where a new board starts. You can undo it with{' '}
                  <KeyCaps keys="mod+z" size="sm" />.
                </>
              ) : (
                <>
                  This board is already empty, so this only returns the view to where a new board
                  starts.
                </>
              )}
            </ConfirmDialog>

            <NoticeDialog
              notice={notice}
              theme={presenceTheme}
              onClose={dismissNotice}
              onLiveCollaboration={readOnly ? undefined : shareFromNotice}
            />

            <SignOutDialog
              open={signOutOpen}
              /* Held open while the navigation is in flight: Escape would
                 otherwise put the board back on screen for the moment before
                 the page goes, which reads as a sign-out that didn't take. */
              onOpenChange={(open) => {
                if (!signingOut) setSignOutOpen(open);
              }}
              name={chromeUser?.name ?? 'Account'}
              email={chromeUser?.email ?? null}
              avatarUrl={user?.isGuest ? null : chromeUser?.avatarUrl}
              isGuest={user?.isGuest ?? false}
              synced={syncStatus === 'connected'}
              busy={signingOut}
              onConfirm={() => {
                void handleSignOut();
              }}
              theme={presenceTheme}
            />

            {/* Mounted only while open: the fields inside hold unsaved edits,
                and closing the window is what discards them. Kept a moment
                longer on the way out, so it can sink away rather than vanish. */}
            <AnimatePresence>
              {settingsOpen && (
                <SettingsDialog
                  key="settings"
                  user={chromeUser}
                  token={authToken}
                  account={account}
                  avatar={avatar}
                  theme={presenceTheme}
                  userId={userId}
                  isGuest={user?.isGuest ?? false}
                  resumeDeletion={resumeDeletion}
                  deleteAccount={deleteAccount}
                  onClose={hideSettings}
                />
              )}
            </AnimatePresence>

            <CommandPalette
              commands={commands}
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              portalContainer={editorRoot}
            />

            {/* Asks an account with no agreement on record to agree to the
                terms. Ahead of the access dialog, which paints over it: losing
                the board outranks being asked about the terms. */}
            <TermsNotice
              profile={account.profile}
              onAccept={account.acceptTerms}
              theme={presenceTheme}
            />
            {/* Last, so it paints over every other dialog. Losing the board
                outranks whatever was being confirmed when it happened. */}
            <AccessRevokedDialog
              open={accessRevoked}
              boardName={boardTitle}
              isGuest={user?.isGuest ?? false}
              theme={presenceTheme}
            />
            {/* Bottom right of the board, inside .cf-editor so it reads the
                same theme tokens as the rest of the chrome. */}
            <VerificationNotice
              profile={account.profile}
              token={authToken}
              onVerified={account.reload}
            />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
