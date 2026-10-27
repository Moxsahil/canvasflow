import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { can, DIAGRAM_LIMIT_REACHED } from '@canvasflow/types';
import { useActorRef, useSelector } from '@xstate/react';
import {
  arrowsAffectedBy,
  bindingAt,
  bindingPointOf,
  bindingTargetAt,
  withPinnedBindings,
  type BindingHint,
  boundArrowPatches,
  computeBoundingRect,
  type DiagramStyle,
  BOOKMARK_SIZE,
  createBookmark,
  createEmbed,
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
  COARSE_HIT_MARGIN,
  HIT_MARGIN,
  hitTest,
  isBookmark,
  isEmbed,
  isFrame,
  isNote,
  isText,
  isTopic,
  hasMindMap,
  layoutMindMaps,
  mindMapMermaid,
  parseOutline,
  topicsFromOutline,
  mindMapDropAt,
  mindMapForest,
  topicGrowth,
  mindMapFoldBadgeAt,
  topicCentre,
  noteLayout,
  topicDropPatches,
  withTopicDropped,
  type TopicDrop,
  topicInk,
  withMindMapBranches,
  withMindMapRoots,
  type NoteShape,
  type TopicShape,
  hiddenShapeIds,
  lockedShapeIds,
  lockSourcesOf,
  shapeHandleAt,
  visibleShapes,
  withHandlePointInserted,
  withHandlePointMoved,
  membershipAfterResize,
  parseEmbedInput,
  readBookmarkUrl,
  readPreviewImageName,
  resolveEmbed,
  type EmbedShape,
  type FrameShape,
  type ImageSource,
  MIN_BOOKMARK_HEIGHT,
  MIN_BOOKMARK_WIDTH,
  MIN_EMBED_SIZE,
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
  pasteNotice,
  canWriteClipboardItems,
  clipboardContentFrom,
  copyDataFor,
  copyJsonOf,
  copySubjectFor,
  copyTextOf,
  hasFlowchart,
  hasWords,
  isPasteNotice,
  mermaidFlowchart,
  pastedTextWidth,
  readClipboardContent,
  readImagesFromClipboard,
  shapesCentredOn,
  withFreshIds,
  wrappedToWidth,
  writeLateTextToClipboard,
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
import type { TouchNavigation } from './pointer/touch-navigation';
import { useBoardItemTouchGuard } from './pointer/useBoardItemTouchGuard';
import { PEN_ERASER_BUTTON } from './pointer/usePointerEvents';
import { useLastPointerPosition } from './pointer/useLastPointerPosition';
import { CanvasStack } from './canvas/CanvasStack';
import { pointerCursorValue } from './canvas/pointer-cursor';
import { bucketCursorValue } from './canvas/bucket-cursor';
import { useCameraPersistence } from './canvas/useCameraPersistence';
import { bucketFillColor, canvasBackgroundFor, nextBucketColor } from './properties/palette';
import { planBucketFill } from './tools/bucket-fill';
import { BucketEyedropper } from './tools/BucketEyedropper';
import { isTypingTarget } from './tools/shortcuts';
import { useCanvasResize } from './canvas/hooks/useCanvasResize';
import { useEdgeScroll } from './canvas/hooks/useEdgeScroll';
import { AppSidebar, readSidebarState, readSidebarWidth } from './menu';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toolbar } from './toolbar/Toolbar';
import { HistoryPanel } from './toolbar/HistoryPanel';
import { ToolLockButton } from './toolbar/ToolLockButton';
import { GlassDock, GlassDockSeparator } from '@/components/ui/glass-dock';
import { NoteEditor } from './text-editor/NoteEditor';
import { TextEditor } from './text-editor/TextEditor';
import {
  grownTopic,
  hasBranches,
  mapStyleFor,
  mindMapFromOutline,
  mindMapRootAt,
  topicTextPatch,
  withTopicBeingTyped,
  type TopicGrowth,
} from './mindmap/mind-map-ops';
import { TopicHandles } from './mindmap/TopicHandles';
import { usePeerTyping, withPeerTyping } from './collab/peer-typing';
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
  reportMentions,
  useCommentPlacement,
  useComments,
  useUnreadThreads,
  type CommentThread,
} from './comments';
import {
  composeDiagram,
  DiagramPanel,
  DiagramsButton,
  expandTopic,
  useDiagramPanel,
  type DiagramEntry,
} from './diagrams';
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
import { EmbedLayer, EmbedPlacer } from './embeds';
import { useLinkCards } from './link-cards/useLinkCards';
import { pastedLinkCardUrl } from './link-cards/link-card-url';
import {
  EMBED_CLICK_MAX_MS,
  EMBED_CLICK_MAX_TRAVEL,
  EMBED_OPEN_DELAY_MS,
  embedBoxFromDrag,
  embedScreenBox,
  inEmbedMiddle,
  type PlacedBox,
} from './embeds/embed-frame';
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
import {
  announceWorkspaceChanged,
  liveBoards,
  SHARED_WITH_YOU,
  useBoardSwitcher,
} from './workspace';
import { announceAccountChanged } from './sync/account-events';
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
import {
  ExportTooLargeError,
  canvasToPngBlob,
  copyPngToClipboard,
  exportScopeFor,
  renderExportCanvas,
  svgMarkup,
  useOpenBoardFile,
  useSaveBoardFile,
  type ExportScope,
  type ImageExportSettings,
} from './file';
import { ExportImageDialog } from './export';
import { FindBar, useCanvasSearch } from './search';
import { AccessRevokedDialog, ShareDialog } from './share';
import { useBoardOverview } from './share/useBoardOverview';
import {
  SettingsDialog,
  accountDeletedUrl,
  requestAccountDeletion,
  takeDeletionResume,
  type DeletionInput,
  type WorkspaceSettingsSource,
} from './settings';
import { warmAccountSecurity } from './settings/account-security-api';
import { readPenSeen, storePenSeen, usePreferences } from './preferences';
import { useAvatar, useAvatarUrls, useProfile } from './profile';
import { VerificationNotice } from './profile/VerificationNotice';
import { TermsNotice } from './profile/TermsNotice';
import { AnalyticsNotice, track, useUsageAnalytics } from './analytics';
import {
  LOCAL_PAGE_TITLE,
  LOCAL_USER,
  LocalAccountButton,
  SignUpPrompt,
  forgetAccountHere,
  leaveForAccount,
  rememberAccountHere,
  useCarryLocalBoard,
  useSignedIn,
  type SignUpReason,
} from './local';

import { ConfirmDialog } from './ui';
import { rich, t as translate, useT } from './i18n';
import { NoticeDialog, type Notice } from './ui/NoticeDialog';
import { BoardLoading } from './ui/BoardLoading';
import { Toast, useToast } from './ui/Toast';
import { CornerMark } from './ui/CornerMark';

/** How far left of centre a thread's pin is put when the board has to be brought to it: about half the thread beside it. */
const THREAD_LEAD = 160;

const genId = () => `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** A link to shapes that have all gone from the board, opened or followed. */
const shapesNotFound = (): Notice => ({
  title: translate('notices.shapesNotFound'),
  body: translate('notices.shapesNotFoundBody'),
  tone: 'warn',
});

/** A link to a comment thread that has since been deleted, opened from an email. */
const commentNotFound = (): Notice => ({
  title: translate('notices.commentNotFound'),
  body: translate('notices.commentNotFoundBody'),
  tone: 'warn',
});

/** `?comment=<thread id>` — the thread a link, such as a mention email's, opens. */
const COMMENT_PARAM = 'comment';

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
 * The same, for one end that has been dragged somewhere new.
 *
 * That end takes hold of whatever it is let go over — or lets go, which for a
 * dragged end is an answer, where for a freshly drawn arrow landing on nothing
 * it is simply nothing to say. The other end keeps hold of what it had, at the
 * very spot it had it: an end stays where it was attached.
 */
function reattachArrowEnd(arrow: ArrowShape, index: number, shapes: readonly Shape[]): ArrowShape {
  // An arrow with a bend in it is routed by hand and never attaches to
  // anything, here or anywhere else — see `arrowsAffectedBy`.
  if (arrow.points.length !== 2 || (index !== 0 && index !== 1)) return arrow;

  const atStart = index === 0;
  const [px, py] = arrow.points[index]!;
  const point = { x: arrow.x + px, y: arrow.y + py };
  const [ox, oy] = arrow.points[1 - index]!;
  const otherPoint = { x: arrow.x + ox, y: arrow.y + oy };
  // As for an arrow just drawn: nothing locked or hidden takes hold of it.
  const targets = withoutLocked(visibleShapes(shapes), lockedShapeIds(shapes));
  const target = bindingTargetAt(targets, point, ARROW_BIND_MARGIN, arrow.id);
  // Nor the shape the other end holds: there is no line between a shape and
  // itself to stop at either end of.
  const other = atStart ? arrow.endBinding : arrow.startBinding;
  const binding =
    target && target.id !== other?.shapeId
      ? bindingAt(target, point, otherPoint, ARROW_BIND_MARGIN)
      : null;

  return atStart ? { ...arrow, startBinding: binding } : { ...arrow, endBinding: binding };
}

/**
 * What to show while the end at `index` of an arrow is being drawn or dragged:
 * the shape it would attach to and the spot it would take, read off the arrow
 * as release would attach it — so the hint never promises what release will
 * not do.
 */
function bindingHintAt(
  attached: ArrowShape | null,
  index: number,
  shapes: readonly Shape[],
): BindingHint | null {
  const binding = attached ? (index === 0 ? attached.startBinding : attached.endBinding) : null;
  if (!binding) return null;
  const point = bindingPointOf(binding, new Map(shapes.map((shape) => [shape.id, shape])));
  return point ? { shapeId: binding.shapeId, point } : null;
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

  // Each end fixed at the spot of the outline it was let go at — see
  // `bindingAt` — and from now on it stays on that spot.
  return {
    ...arrow,
    startBinding: startTarget ? bindingAt(startTarget, start, end, ARROW_BIND_MARGIN) : null,
    endBinding: endTarget ? bindingAt(endTarget, end, start, ARROW_BIND_MARGIN) : null,
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
  /**
   * The board kept in this browser, at the editor's own address: drawn on
   * without an account, saved in IndexedDB, and never sent to the server.
   * Whatever needs an account — sharing, comments, the library, settings —
   * offers one instead.
   */
  local?: boolean;
}

/**
 * The account the sidebar last showed, kept for as long as the tab is open.
 *
 * Every board mints its own token, and until the new one arrives there is no
 * one to name. Opening a board from the sidebar would otherwise blank the
 * account row for that moment on every switch.
 */
let lastChromeUser: {
  name: string;
  email: string | null;
  avatarUrl: string | null;
  username: string | null;
} | null = null;

export function Editor({ boardId, local = false }: EditorProps) {
  const t = useT();
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
  const [sidebarDefaultWidth] = useState(readSidebarWidth);

  const {
    authToken,
    refresh: refreshAuthToken,
    refreshNow: refreshAuthTokenNow,
    accessDenied: tokenAccessDenied,
  } = useAuthToken(boardId, { enabled: !local });
  /** Whether this browser has an account signed in, asked only on the local board. */
  const signedIn = useSignedIn(local) === true;
  /** What was asked of the local board that only an account's board can do. */
  const [signUpReason, setSignUpReason] = useState<SignUpReason | null>(null);
  const hideSignUp = useCallback(() => setSignUpReason(null), []);

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
  /**
   * A press inside the box around the selection that landed on none of its
   * shapes — the space between two of them — waiting to see whether it comes
   * up as a click, which lets the selection go, or a drag, which moves it.
   */
  const selectionGapPressRef = useRef<Point | null>(null);
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
  // The local board has nothing to share yet: asking is asking for an account.
  const showShare = useCallback(
    () => (local ? setSignUpReason('share') : setShareOpen(true)),
    [local],
  );
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
  const { show: showToast } = toast;
  const dismissNotice = useCallback(() => setNotice(null), []);
  const showOpenNotice = useCallback(
    (body: string) => setNotice({ title: translate('notices.openBoard'), body, tone: 'warn' }),
    [],
  );
  const showSaveNotice = useCallback(
    (body: string) => setNotice({ title: translate('notices.saveBoard'), body, tone: 'warn' }),
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
  const user = useMemo(
    () => (local ? LOCAL_USER : authToken ? decodeJwtUser(authToken) : null),
    [local, authToken],
  );
  const userId = user?.id ?? null;
  // The name a note put down here is signed with. Nobody signs one on the
  // local board, which has no one else to tell apart. A ref, because it is
  // read where a shape is committed — a subscription, not a render.
  const noteAuthorRef = useRef<string | undefined>(undefined);
  noteAuthorRef.current = !local && user ? user.name : undefined;
  // An account has been here: the editor's own address checks for it first
  // next time, and opens its boards rather than the local board.
  const accountHere = !local && user !== null && !user.isGuest;
  useEffect(() => {
    if (accountHere) rememberAccountHere();
  }, [accountHere]);
  // The account's own library, kept across boards. A guest has none.
  const library = useLibrary({ userId, token: authToken, isGuest: user?.isGuest ?? true });
  // Diagrams generated from a description, counted against the month's
  // allowance. The panel is the one place they are asked for and placed from.
  const [diagramsOpen, setDiagramsOpen] = useState(false);
  const [diagramsMinimized, setDiagramsMinimized] = useState(false);
  const diagrams = useDiagramPanel({
    boardId,
    userId: user?.id ?? null,
    token: authToken,
    open: diagramsOpen,
    signedIn: accountHere,
  });

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
    onNameSaved: refreshAuthTokenNow,
    // Re-read on every remint, so a change made elsewhere — another device,
    // beyond the reach of this browser's channel — lands without a reload.
    revalidateOn: authToken,
  });
  const cursorColor = account.profile?.cursorColor ?? null;
  const usage = useUsageAnalytics(account, boardId);

  /**
   * The photo this client publishes to the board, if any.
   *
   * Only one uploaded here. A sign-in provider's generated avatar stays out of
   * presence altogether: it is not a picture of anyone, and the coloured
   * initial it would replace says more.
   */
  const publishedAvatar = account.profile?.avatarUploaded ? account.profile.avatarVersion : null;

  /** The username this account chose, published so others can @ it by name. */
  const ownUsername = account.profile?.username ?? null;

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
    // Undefined until the profile answers, so a photo kept from the last
    // visit stays up meanwhile.
    version: account.profile ? (account.profile.avatarVersion ?? null) : undefined,
    onChanged: account.reload,
  });

  // Nobody on the local board: its account row offers one instead.
  const chromeUser = useMemo(
    () =>
      local
        ? null
        : user
          ? { name: user.name, email: user.email, avatarUrl: avatar.url, username: ownUsername }
          : lastChromeUser,
    [local, user, avatar.url, ownUsername],
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
    local,
    localTitle: t('local.boardTitle'),
    userId: user?.id ?? null,
    onNotice: showToast,
  });
  // Someone outside the board's workspace — let in by a share link — has no
  // board list to name it from, and the sidebar falls back to the id. The
  // gateway names it for anyone on the board, and says whose it is, which the
  // Share window tells a non-owner.
  const overview = useBoardOverview(
    boardId,
    authToken,
    !local && user !== null && user.role !== 'owner',
  );
  const boardTitle =
    boardSwitcher.title === boardId && overview ? overview.title : boardSwitcher.title;
  // The tab names the board, as any document app's does. The local board keeps
  // the page's own title, which is also what search results show for it; an
  // account's board is "CanvasFlow" alone until its name has loaded.
  useEffect(() => {
    if (local) {
      document.title = LOCAL_PAGE_TITLE;
      return;
    }
    const known = boardTitle !== boardId;
    document.title = known ? `${boardTitle} — CanvasFlow` : 'CanvasFlow';
  }, [local, boardTitle, boardId]);
  // With no argument it targets the board on screen, which is what the
  // sidebar's "Rename board" row means.
  const { beginRename, canRename } = boardSwitcher;
  const handleRenameBoard = useCallback(() => beginRename(), [beginRename]);

  // Whoever runs the open board's workspace runs its sharing too, as its owner
  // does. Read from the sidebar's list, where each workspace carries one's role.
  const managesBoardWorkspace = useMemo(() => {
    const role = boardSwitcher.workspaces?.find(
      (workspace) => workspace.id === boardSwitcher.workspaceId,
    )?.role;
    return role !== undefined && can(role, 'manage-members');
  }, [boardSwitcher.workspaces, boardSwitcher.workspaceId]);
  /**
   * Runs this board's sharing: its owner, or whoever runs its workspace. Only
   * they are offered a link to the board — the board link and links to a
   * selection alike. Everyone else, in the workspace or let on by link, is
   * offered none to pass on.
   */
  const runsSharing = user?.role === 'owner' || managesBoardWorkspace;

  // Archiving is for whoever may delete the board: its owner, or whoever runs
  // its workspace — the same people who run its sharing.
  const { unarchiveBoard } = boardSwitcher;
  const unarchiveOpenBoard = useCallback(
    () => unarchiveBoard(boardId).then(refreshAuthTokenNow),
    [unarchiveBoard, boardId, refreshAuthTokenNow],
  );

  // The token says whether the board is archived, and it is what makes the
  // board read-only here. When the list says otherwise — archived or brought
  // back, here or by somebody else — the token is re-minted at once, so the
  // tools follow without waiting for the server's sweep. Once per change: if
  // the token still disagrees, the list was the stale one.
  const listArchived = boardSwitcher.archived;
  const tokenArchived = user?.archived;
  const archivedAskedRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (listArchived === null || tokenArchived === undefined) return;
    if (listArchived === tokenArchived) {
      archivedAskedRef.current = null;
      return;
    }
    if (archivedAskedRef.current === listArchived) return;
    archivedAskedRef.current = listArchived;
    refreshAuthTokenNow();
  }, [listArchived, tokenArchived, refreshAuthTokenNow]);

  // Settings → Workspace is about the workspace the sidebar header names: the
  // one being browsed, else the open board's own. While the sidebar lists the
  // boards shared from other people's workspaces, there is no workspace there
  // to run, and the page says so — naming the board's real workspace and
  // pointing at one's own — rather than quietly showing one's own workspace
  // under a board that belongs to somebody else's.
  const settingsWorkspace = useMemo<WorkspaceSettingsSource>(() => {
    if (user?.isGuest || !boardSwitcher.available) return { status: 'none' };
    const { workspaces, listedId, sharedBoards } = boardSwitcher;
    if (!workspaces) return { status: 'loading' };
    if (listedId === SHARED_WITH_YOU) {
      return {
        status: 'shared',
        board: sharedBoards?.find((board) => board.id === boardId) ?? null,
        own: workspaces[0] ?? null,
      };
    }
    const workspace = workspaces.find((candidate) => candidate.id === listedId);
    return workspace ? { status: 'ready', workspace } : { status: 'loading' };
  }, [user?.isGuest, boardSwitcher, boardId]);
  const { renameWorkspace, dismissError: dismissSwitcherError } = boardSwitcher;
  const renameWorkspaceFromSettings = useCallback(
    async (workspaceId: string, name: string) => {
      try {
        await renameWorkspace(workspaceId, name);
      } catch (err) {
        // Settings says why itself; the sidebar's menu shouldn't say it again
        // the next time it opens.
        dismissSwitcherError();
        throw err;
      }
    },
    [renameWorkspace, dismissSwitcherError],
  );

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

  // Arrows attached the old way, aiming at the middle of their shape and
  // re-aiming whenever anything moves, are fixed where they stand: as this
  // board opens for editing, and whenever one arrives later — a paste, a
  // library item, a collaborator on an older version. Nothing moves, and it is
  // not an undo step. See withPinnedBindings.
  useEffect(() => {
    if (readOnly) return;
    let byId: Map<string, Shape> | null = null;
    const pinned: ArrowShape[] = [];
    for (const shape of shapes) {
      if (!isArrow(shape)) continue;
      const aiming =
        (shape.startBinding && !shape.startBinding.precise) ||
        (shape.endBinding && !shape.endBinding.precise);
      if (!aiming) continue;
      byId ??= new Map(shapes.map((each) => [each.id, each]));
      const fixed = withPinnedBindings(shape, byId);
      if (fixed !== shape) pinned.push(fixed);
    }
    if (pinned.length > 0) doc.pinArrowBindings(pinned);
  }, [doc, shapes, readOnly]);

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
    onAccessChanged: refreshAuthTokenNow,
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
    // Someone renamed a workspace, changed a board in it, or let someone onto
    // one: the sidebar and Settings re-read it.
    onWorkspaceChanged: announceWorkspaceChanged,
    // An email switch flipped in another tab: Settings, if open, re-reads it.
    onAccountChanged: announceAccountChanged,
  });

  /**
   * An account's board whose content has not arrived yet: nothing cached on
   * this device, and the server's copy still on its way. The pencil turns over
   * the empty board until it lands, rather than leaving a blank canvas that
   * looks like the board is empty. Only while there is a connection coming —
   * offline, the board is what it is — and gone the moment anything is drawn.
   */
  const waitingForBoard =
    !local &&
    !boardSynced &&
    !accessRevoked &&
    shapes.length === 0 &&
    syncStatus !== 'offline' &&
    syncStatus !== 'error';

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
    // The editor's address opens the local board again from now on, at once.
    forgetAccountHere();
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
      forgetAccountHere();
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
  /** A box being dragged out with the embed tool, in world units. */
  const [embedDraft, setEmbedDraft] = useState<{ from: Point; to: Point } | null>(null);
  const embedDraftRef = useRef<{ from: Point; to: Point } | null>(null);
  /**
   * The link field, while it is open: beside a box just placed with the embed
   * tool, or beside an embed whose link is being changed.
   */
  const [embedPlacement, setEmbedPlacement] = useState<
    { readonly box: PlacedBox } | { readonly editingId: string } | null
  >(null);
  /** The embed whose page takes presses, if one does; every other one lets them through. */
  const [activeEmbedId, setActiveEmbedId] = useState<string | null>(null);
  /** The embed whose middle the pointer is over, which shows how to use it. */
  const [hoveredEmbedId, setHoveredEmbedId] = useState<string | null>(null);
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
  // Counted when it changes, not as a board opens on the default tool.
  const toolTracked = useRef(false);
  useEffect(() => {
    if (toolTracked.current) track('tool_selected', { tool: activeTool });
    toolTracked.current = true;
  }, [activeTool]);
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
  // A topic keeps its words as a text shape does, in a box its map places.
  const editingTopic = editingTextShape && isTopic(editingTextShape) ? editingTextShape : null;
  // A note keeps its words as well, in the room its paper gives them.
  const editingNote = editingTextShape && isNote(editingTextShape) ? editingTextShape : null;
  const editingTextInitialValue =
    editingText?.text ??
    editingTopic?.text ??
    editingNote?.text ??
    (editingArrow ? arrowLabelOf(editingArrow) : undefined);
  // Bump a key whenever a new text-editing session starts (a new textEditingAt
  // reference), so <TextEditor> remounts with blank state instead of reusing
  // the previous instance — commit/re-entry into editingText happens within
  // one batched update, so textEditingAt never passes through null in between.
  const textEditingKeyRef = useRef(0);
  // What is in the overlay right now, mirrored out of it so collaborators can
  // be shown it. The overlay stays the owner of the value; this is a copy that
  // exists only to be published.
  const [liveText, setLiveText] = useState('');
  /**
   * A topic being dragged to a new place in its map: where the pointer is,
   * where on the topic it took hold, and where it would land if let go now.
   * The map is drawn as if it already had, so the drop is seen before it is
   * made. Mirrored in a ref for the release, which reads it after the render.
   */
  const [topicDrag, setTopicDrag] = useState<{
    readonly id: string;
    readonly point: Point;
    readonly grab: Point;
    readonly drop: TopicDrop | null;
  } | null>(null);
  const topicDragRef = useRef<{ id: string; grab: Point; drop: TopicDrop | null } | null>(null);
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

  const { setCursor, setSelection, setLasering, setDraft, setTyping } = useSelfPresence({
    channel,
    user,
    cursorColor,
    avatarVersion: publishedAvatar,
    username: ownUsername,
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
        ? {
            id: user.id,
            name: user.name,
            color: cursorColor,
            avatarVersion: publishedAvatar,
            username: ownUsername,
          }
        : null,
    [user, cursorColor, publishedAvatar, ownUsername],
  );

  const { peersRef, subscribe, roster } = usePeerPresence({
    channel,
    self: rosterSelf,
    selfActivity: activity,
  });
  const peerTyping = usePeerTyping(peersRef, subscribe);

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
  const boardShapes = shapes;
  const shapesForRender = useMemo(() => {
    // Everyone else's words in progress first, so what this client does on
    // top of them — typing, dragging a topic — is drawn over the latest.
    const shapes = withPeerTyping(boardShapes, peerTyping, editingTextShapeId);
    if (topicDrag) {
      // The map as it would be with the topic let go here, and a faint copy
      // of the topic under the pointer, carried along by it.
      const dragged = shapes.find((shape) => shape.id === topicDrag.id);
      const preview = topicDrag.drop
        ? layoutMindMaps(withTopicDropped(shapes, topicDrag.id, topicDrag.drop))
        : shapes;
      if (!dragged || !isTopic(dragged)) return preview;
      const carried: TopicShape = {
        ...dragged,
        id: `${dragged.id}:carried`,
        x: topicDrag.point.x - topicDrag.grab.x,
        y: topicDrag.point.y - topicDrag.grab.y,
        parentId: null,
        collapsed: false,
        opacity: Math.round(dragged.opacity * 0.45),
      };
      return [...preview, carried];
    }
    if (!editingTextShapeId) return shapes;
    // A topic stays on the board, holding what is being typed, and its map
    // makes room around it keystroke by keystroke.
    if (shapes.some((shape) => shape.id === editingTextShapeId && isTopic(shape))) {
      return withTopicBeingTyped(shapes, editingTextShapeId, liveText);
    }
    return shapes.flatMap((shape) => {
      if (shape.id !== editingTextShapeId) return [shape];
      // A note stays too, holding what is being typed, so its words are
      // fitted and its paper grows as they go in.
      if (isNote(shape)) return [{ ...shape, text: liveText }];
      return isArrow(shape) ? [{ ...shape, label: liveText }] : [];
    });
  }, [boardShapes, peerTyping, editingTextShapeId, liveText, topicDrag]);

  // An arrow with its label open shows no selection chrome. The outline traces
  // the line, so it would run straight through the gap the caret is standing
  // in and put the whole of it back. Only what the layer paints: the selection
  // itself is untouched, so the panel still answers for the arrow and it is
  // still what a delete would take.
  const selectedIdsForRender = useMemo(
    () => (editingArrow ? selectedIds.filter((id) => id !== editingArrow.id) : selectedIds),
    [selectedIds, editingArrow],
  );

  /**
   * Put a topic's words in, as the overlay hands them over. Emptied out, a
   * topic with nothing branching from it goes — it was only ever a box to
   * type into — and one that still holds a branch keeps the words it had.
   *
   * Answers whether the topic is still on the board.
   */
  const settleTopicText = useCallback(
    (topic: TopicShape, text: string): boolean => {
      const current = doc.getShapes();
      if (text.trim() === '') {
        if (hasBranches(current, topic.id)) return true;
        doc.deleteShapes([topic.id]);
        return false;
      }
      if (text !== topic.text) doc.updateShape(topic.id, topicTextPatch(current, topic, text));
      return true;
    },
    [doc],
  );

  /** Select a topic and open its words for typing. */
  const editTopic = useCallback(
    (topicId: string) => {
      const topic = doc.getShapes().find((shape) => shape.id === topicId);
      if (!topic || !isTopic(topic)) return;
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [topicId] });
      actorRef.send({
        type: 'EDIT_TEXT_SHAPE',
        shapeId: topicId,
        position: topicCentre(topic),
        existingText: topic.text,
      });
    },
    [actorRef, doc],
  );

  /** Select a note and open its words for typing. */
  const editNote = useCallback(
    (noteId: string) => {
      const note = doc.getShapes().find((shape) => shape.id === noteId);
      if (!note || !isNote(note)) return;
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [noteId] });
      actorRef.send({
        type: 'EDIT_TEXT_SHAPE',
        shapeId: noteId,
        position: { x: note.x, y: note.y },
        existingText: note.text,
      });
    },
    [actorRef, doc],
  );

  /**
   * Grow a map from a topic, and open the new one for typing: Tab for a topic
   * under it, Enter for one beside it. The new topic is on the board from the
   * start, so everyone sees the map make room for it as it is named.
   *
   * Answers whether there was a topic to grow from.
   */
  const growMindMap = useCallback(
    (topicId: string, growth: TopicGrowth): boolean => {
      if (readOnly) return false;
      const current = doc.getShapes();
      const grown = grownTopic(current, topicId, growth, genId());
      if (!grown) return false;
      doc.breakUndoGroup();
      // A topic added under a folded one opens it, or it would be added out
      // of sight.
      const parent = current.find((shape) => shape.id === grown.parentId);
      doc.batch(() => {
        if (parent && isTopic(parent) && parent.collapsed === true) {
          doc.updateShape(parent.id, { collapsed: false });
        }
        doc.addShape(grown);
      });
      editTopic(grown.id);
      return true;
    },
    [doc, editTopic, readOnly],
  );

  /**
   * A new map, its centre put down where the tool was pressed and opened for
   * its name. The tool goes back to select, unless the lock holds it.
   */
  const startMindMap = useCallback(
    (point: Point) => {
      const {
        itemStyle: style,
        camera: view,
        dynamicSize,
        toolLocked,
      } = actorRef.getSnapshot().context;
      const root = mindMapRootAt(point, style, newShapeScale(view, dynamicSize), genId());
      doc.breakUndoGroup();
      doc.addShape(root);
      if (!toolLocked) actorRef.send({ type: 'SELECT_TOOL', tool: 'select' });
      editTopic(root.id);
    },
    [actorRef, doc, editTopic],
  );

  /**
   * Tab or Enter on the board, with one topic selected: grow its map from it.
   * Answers whether it did, so the keys keep their usual jobs everywhere else.
   */
  const handleGrowSelectedTopic = useCallback(
    (growth: TopicGrowth): boolean => {
      if (selectedIds.length !== 1 || viewMode || readOnly) return false;
      const only = shapes.find((shape) => shape.id === selectedIds[0]);
      if (!only || lockedIds.has(only.id)) return false;
      // Enter on a note opens its words, as a double press does.
      if (isNote(only)) {
        if (growth !== 'sibling') return false;
        editNote(only.id);
        return true;
      }
      if (!isTopic(only)) return false;
      return growMindMap(only.id, growth);
    },
    [selectedIds, shapes, lockedIds, viewMode, readOnly, growMindMap, editNote],
  );

  /** Enter or Tab in a topic's overlay: keep what was typed, then grow from it. */
  const handleTopicKey = useCallback(
    (growth: TopicGrowth) => (text: string) => {
      const editingId = actorRef.getSnapshot().context.editingTextShapeId;
      const topic = doc.getShapes().find((shape) => shape.id === editingId);
      if (!topic || !isTopic(topic)) return;
      if (!settleTopicText(topic, text)) {
        // Left empty, so it is gone: the key ends typing rather than grow
        // from a topic that is no longer there.
        actorRef.send({ type: 'COMMIT_TEXT', text });
        return;
      }
      if (!growMindMap(topic.id, growth)) actorRef.send({ type: 'COMMIT_TEXT', text });
    },
    [actorRef, doc, settleTopicText, growMindMap],
  );
  const handleTopicEnter = useMemo(() => handleTopicKey('sibling'), [handleTopicKey]);
  const handleTopicTab = useMemo(() => handleTopicKey('child'), [handleTopicKey]);

  const showImageNotice = useCallback(
    (body: string) => setNotice({ title: translate('tools.image'), body, tone: 'warn' }),
    [],
  );

  const images = useBoardImages({
    boardId,
    doc,
    shapes,
    token: authToken,
    canEdit: !readOnly,
    local,
    onError: showImageNotice,
  });
  const linkCards = useLinkCards({ doc, shapes, token: authToken, canEdit: !readOnly, local });
  const resolveImageDataUrls = images.resolveDataUrls;
  const resolveCardDataUrls = linkCards.resolveDataUrls;
  /**
   * Every picture the board draws: its own images, and the ones link cards
   * show. Keyed apart — a board image by its content hash, a card's picture
   * by a hash and an extension — so the two never answer for each other.
   */
  const boardPictures = useMemo(
    () => ({
      cache: {
        get: (id: string) => images.cache.get(id) ?? linkCards.images.get(id),
      } satisfies ImageSource,
      resolveDataUrls: async (subject: readonly Shape[]) =>
        new Map([
          ...(await resolveImageDataUrls(subject)),
          ...(await resolveCardDataUrls(subject)),
        ]),
    }),
    // The parts, not the hook's result, which is a new object every render.
    [images.cache, resolveImageDataUrls, linkCards.images, resolveCardDataUrls],
  );
  const pictureRevision = images.revision + linkCards.revision;

  /** This board as Export all boards reads it: live, not as last saved. */
  const exportOpenBoard = useMemo(
    () => ({ id: boardId, shapes: () => doc.getShapes() }),
    [boardId, doc],
  );

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
        showImageNotice(translate('notices.fileUnopenable'));
      }
    })();
  }, [images, viewportCentre, showImageNotice, readOnly]);

  /**
   * Put an embed of `url` on the board, with its middle on `at` or the middle
   * of the view, at the size its site's page is made for — and select it, so
   * it can be moved or opened straight away.
   */
  const insertEmbed = useCallback(
    (url: string, at?: Point) => {
      if (readOnly) return;
      const embed = resolveEmbed(url);
      if (!embed) return;
      const [placed] = shapesCentredOn(
        [
          createEmbed({
            id: genId(),
            x: 0,
            y: 0,
            width: embed.width,
            height: embed.height,
            url: embed.url,
          }),
        ],
        at ?? viewportCentre(),
        doc.getShapes(),
      );
      if (!placed) return;
      doc.addShape(placed);
      doc.breakUndoGroup();
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [placed.id] });
    },
    [doc, actorRef, readOnly, viewportCentre],
  );

  /**
   * Put a link card for `url` on the board, centred on `at` or the middle of
   * the view, and select it. It shows its address straight away and fills in
   * once the page has been read (see useLinkCards).
   */
  const insertLinkCard = useCallback(
    (url: string, at?: Point) => {
      if (readOnly) return;
      const [placed] = shapesCentredOn(
        [createBookmark({ id: genId(), x: 0, y: 0, ...BOOKMARK_SIZE, url })],
        at ?? viewportCentre(),
        doc.getShapes(),
      );
      if (!placed) return;
      doc.addShape(placed);
      doc.breakUndoGroup();
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [placed.id] });
    },
    [doc, actorRef, readOnly, viewportCentre],
  );

  /**
   * One shape, swapped for another of a different kind where it stands —
   * one undo step, and the new one selected in its place.
   */
  const replaceShape = useCallback(
    (from: Shape, to: Shape) => {
      doc.breakUndoGroup();
      doc.batch(() => {
        doc.deleteShapes([from.id]);
        doc.addShape(to);
      });
      doc.breakUndoGroup();
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [to.id] });
    },
    [doc, actorRef],
  );

  const cancelEmbedPlacement = useCallback(() => {
    embedDraftRef.current = null;
    setEmbedDraft(null);
    setEmbedPlacement(null);
  }, []);
  /**
   * A link the field could not embed, put in the box as a card for its page
   * instead: as drawn, or at a card's own size where the box was a click.
   */
  const handleLinkCardFromField = useCallback(
    (url: string) => {
      const placement = embedPlacement;
      setEmbedPlacement(null);
      if (!placement || !('box' in placement) || readOnly) return;
      const { box } = placement;
      const width = box.clicked ? BOOKMARK_SIZE.width : Math.max(MIN_BOOKMARK_WIDTH, box.width);
      const height = box.clicked ? BOOKMARK_SIZE.height : Math.max(MIN_BOOKMARK_HEIGHT, box.height);
      const shape = createBookmark({
        id: genId(),
        x: box.x + box.width / 2 - width / 2,
        y: box.y + box.height / 2 - height / 2,
        width,
        height,
        url,
      });
      doc.breakUndoGroup();
      doc.addShape(shape);
      doc.breakUndoGroup();
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [shape.id] });
    },
    [doc, actorRef, embedPlacement, readOnly],
  );
  /**
   * The link the field was given: a new embed in the box that was placed, or
   * a new page for the embed being edited, which keeps its box — whoever
   * sized it did so on purpose, and a different video is no reason to undo it.
   */
  const handleEmbedLink = useCallback(
    (url: string) => {
      const placement = embedPlacement;
      setEmbedPlacement(null);
      if (!placement || readOnly) return;
      if ('editingId' in placement) {
        doc.breakUndoGroup();
        // The old page's title and still go with it; the new page's are read in.
        doc.updateShape(placement.editingId, { url, title: '', poster: null } as Partial<Shape>);
        doc.breakUndoGroup();
        return;
      }
      const embed = resolveEmbed(url);
      if (!embed) return;
      // A click placed a video's size as a stand-in; the site's own size takes
      // its place, on the same middle. A box dragged out is kept as drawn.
      const { box } = placement;
      const width = box.clicked ? embed.width : box.width;
      const height = box.clicked ? embed.height : box.height;
      const shape = createEmbed({
        id: genId(),
        x: box.x + box.width / 2 - width / 2,
        y: box.y + box.height / 2 - height / 2,
        width,
        height,
        url: embed.url,
      });
      doc.breakUndoGroup();
      doc.addShape(shape);
      doc.breakUndoGroup();
      actorRef.send({ type: 'SELECT_ALL', shapeIds: [shape.id] });
    },
    [doc, actorRef, embedPlacement, readOnly],
  );

  // A topic's words sit in the middle of its box, which grows and moves as
  // they are typed, so the overlay follows the box as it is drawn.
  const typedTopic = editingTopic
    ? (shapesForRender.find((shape) => shape.id === editingTopic.id) as TopicShape | undefined)
    : undefined;
  const textEditorWorldPosition = typedTopic ? topicCentre(typedTopic) : textEditingAt;
  // The one topic selected, with nothing else going on: what the dots for
  // growing and folding it are put around.
  const selectedTopic = useMemo(() => {
    if (selectedIds.length !== 1 || !isIdle || readOnly || viewMode || topicDrag) return null;
    if (activeTool !== 'select' || lockedIds.has(selectedIds[0]!)) return null;
    const topic = shownShapes.find((shape) => shape.id === selectedIds[0]);
    if (!topic || !isTopic(topic)) return null;
    return {
      topic,
      isRoot: withMindMapRoots([topic.id], shapes)[0] === topic.id,
      growth: topicGrowth(topic, mindMapForest(shapes)),
      hasBranches: hasBranches(shapes, topic.id),
    };
  }, [
    selectedIds,
    isIdle,
    readOnly,
    viewMode,
    topicDrag,
    activeTool,
    lockedIds,
    shownShapes,
    shapes,
  ]);

  // A note's words are typed where they will be drawn: over the room its
  // paper gives them, at the size it fits them to as they stand.
  const typedNote = editingNote
    ? (shapesForRender.find((shape) => shape.id === editingNote.id) as NoteShape | undefined)
    : undefined;
  const noteEditor = useMemo(() => {
    if (!typedNote || !textEditingAt) return null;
    const layout = noteLayout(typedNote);
    return {
      box: {
        left: (typedNote.x + (layout.width - layout.textWidth) / 2 - camera.x) * camera.zoom,
        top: (layout.textY - camera.y) * camera.zoom,
        width: layout.textWidth * camera.zoom,
      },
      fontSize: layout.fontSize * camera.zoom,
      lineHeight: layout.lineHeight * camera.zoom,
      lineCount: layout.lines.length,
    };
  }, [typedNote, textEditingAt, camera]);

  const textEditorScreenPosition =
    textEditingAt && textEditorWorldPosition
      ? {
          x: (textEditorWorldPosition.x - camera.x) * camera.zoom,
          y: (textEditorWorldPosition.y - camera.y) * camera.zoom,
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

  // An embed deleted or hidden — here or by someone else — while its page has
  // the presses gives them back, rather than leaving a ghost taking them.
  useEffect(() => {
    if (activeEmbedId && !shownShapes.some((shape) => shape.id === activeEmbedId)) {
      setActiveEmbedId(null);
    }
  }, [activeEmbedId, shownShapes]);

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
  const typedWords = editingText ?? editingTopic;
  const textEditorFontSize =
    (arrowLabelType?.fontSize ??
      (typedWords ? fontSizeOf(typedWords) : itemStyle.fontSize * newTextScale)) * camera.zoom;
  const textEditorFontFamily =
    arrowLabelType?.fontFamily ?? (typedWords ? typedWords.fontFamily : itemStyle.fontFamily);
  // Resolved for the board being typed on, so the caret's text is the colour
  // the shape takes the moment it is committed.
  const textEditorColor = editingTopic
    ? topicInk(editingTopic, resolvedTheme === 'dark')
    : strokeColorFor(
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
  // The username comes from the profile, as the one on the presence record does.
  const commentAuthor = useMemo(
    () =>
      user
        ? { id: user.id, name: user.name, ...(ownUsername ? { username: ownUsername } : {}) }
        : null,
    [user, ownUsername],
  );

  // Who a comment here can name with an @: whoever is on the board now, and
  // whoever has written or been named on it before. The full list of a board's
  // members is its owner's to see, so it is not what this is drawn from.
  const mentionable = useMemo(
    () =>
      mentionablePeople(
        roster.map((entry) => ({
          id: entry.userId,
          name: entry.name,
          ...(entry.username ? { username: entry.username } : {}),
        })),
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

  // A comment naming people: the gateway emails them, reading the comment off
  // the board rather than taking it from here.
  const reportCommentMentions = useCallback(
    (threadId: string, commentId: string) =>
      reportMentions(authToken, boardId, threadId, commentId),
    [authToken, boardId],
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

  // The bucket shares its fill colour, pattern and opacity with the shape
  // tools, so the panel edits the same style for it — showing the colour it
  // will actually pour, which is never transparent.
  const editingBucket = activeTool === 'bucket' && selectedShapes.length === 0;
  const pourColor = bucketFillColor(itemStyle.fillColor);

  const firstSelected = selectedShapes[0];
  // Only notes being edited, selected or about to be put down. The panel
  // shows a note's paper, size and alignment in the places every shape's
  // fill, size and alignment go, and a choice made for the tool is
  // remembered for notes alone — see `ItemStyle`.
  const editingNotes =
    propertyShapeKinds.length > 0 && propertyShapeKinds.every((kind) => kind === 'note');
  const propertyStyle: ItemStyle = firstSelected
    ? mapStyleFor(firstSelected, shapes, itemStyleFromShape(firstSelected, itemStyle))
    : editingBucket
      ? { ...itemStyle, fillColor: pourColor }
      : editingNotes
        ? {
            ...itemStyle,
            fillColor: itemStyle.noteColor,
            fontSize: itemStyle.noteFontSize,
            textAlign: itemStyle.noteTextAlign,
          }
        : itemStyle;

  // Nothing in the properties panel does anything for a viewer, and offering
  // controls that silently no-op is worse than not offering them. Focus mode
  // puts it away with the rest of the chrome.
  //
  // Nor for a selection that is all locked: every control would be refused.
  const showProperties =
    !readOnly &&
    !chromeHidden &&
    (selectedShapes.length > 0 ? !selectionLocked : toolShapeKind !== null || editingBucket);

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
  const embedEditingId =
    embedPlacement && 'editingId' in embedPlacement ? embedPlacement.editingId : null;
  const embedEditingShape = embedEditingId
    ? shapes.find((s): s is EmbedShape => s.id === embedEditingId && isEmbed(s))
    : undefined;
  // Deleted — here or by someone else — while its link was open for editing:
  // there is nothing left for the field to change.
  useEffect(() => {
    if (embedEditingId && !embedEditingShape) setEmbedPlacement(null);
  }, [embedEditingId, embedEditingShape]);
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
      // Always remember the choice, so the next shape drawn inherits it — a
      // note's paper, size and alignment as the next note's, and not as the
      // fill, size and alignment of everything else.
      if (editingNotes) {
        const { fillColor, fontSize, textAlign, ...shared } = patch;
        actorRef.send({
          type: 'SET_ITEM_STYLE',
          style: {
            ...shared,
            ...(fillColor && { noteColor: fillColor }),
            ...(fontSize !== undefined && { noteFontSize: fontSize }),
            ...(textAlign && { noteTextAlign: textAlign }),
          },
        });
      } else {
        actorRef.send({ type: 'SET_ITEM_STYLE', style: patch });
      }
      if (selectedIds.length === 0) return;
      // A map's layout and lines belong to the map, which keeps them on its
      // centre, and an outline only means something to a topic.
      const { mapLayout, mapLines, topicShape, ...rest } = patch;
      const current = doc.getShapes();
      doc.batch(() => {
        for (const id of selectedIds) {
          doc.updateShape(id, rest);
        }
        const topics = selectedIds.filter((id) =>
          current.some((shape) => shape.id === id && isTopic(shape)),
        );
        if (topicShape) for (const id of topics) doc.updateShape(id, { topicShape });
        if (mapLayout || mapLines) {
          for (const id of withMindMapRoots(topics, current)) {
            doc.updateShape(id, {
              ...(mapLayout && { mapLayout }),
              ...(mapLines && { mapLines }),
            });
          }
        }
      });

      if (!transient) doc.breakUndoGroup();
    },
    [actorRef, doc, selectedIds, editingNotes],
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

  /**
   * Where the end of an arrow being drawn or dragged would attach: the shape
   * outlined and the spot marked. Set only when it changes, as the guides are,
   * since an end held over one spot gives the same answer every frame.
   */
  const [bindingHint, setBindingHint] = useState<BindingHint | null>(null);
  const bindingHintRef = useRef<BindingHint | null>(null);
  const showBindingHint = useCallback((next: BindingHint | null) => {
    const shown = bindingHintRef.current;
    const same =
      shown === next ||
      (shown !== null &&
        next !== null &&
        shown.shapeId === next.shapeId &&
        shown.point.x === next.point.x &&
        shown.point.y === next.point.y);
    if (same) return;
    bindingHintRef.current = next;
    setBindingHint(next);
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
  // Before the paint, so a topic opened for typing is never drawn for a frame
  // holding the words from the one opened before it.
  // Which session `liveText` belongs to. For the one render between a new
  // session starting and this resetting it, `liveText` still holds the last
  // session's words, and those must not go out as this one's.
  const [liveTextAt, setLiveTextAt] = useState(textEditingAt);
  useLayoutEffect(() => {
    setLiveText(openingTextRef.current ?? '');
    setLiveTextAt(textEditingAt);
  }, [textEditingAt]);

  /**
   * Words typed into a shape already on the board go out as they are typed,
   * so everyone sees them letter by letter — as a new text box is seen
   * through its draft. Cleared the moment typing ends; the words that were
   * kept arrive through the document.
   */
  useEffect(() => {
    const typed = editingTextShapeId ? shapes.find((s) => s.id === editingTextShapeId) : undefined;
    if (!typed || !(isTopic(typed) || isText(typed) || isNote(typed) || isArrow(typed))) {
      setTyping(null);
      return;
    }
    const text = liveTextAt === textEditingAt ? liveText : (openingTextRef.current ?? '');
    setTyping({ shapeId: typed.id, text });
  }, [editingTextShapeId, shapes, liveText, liveTextAt, textEditingAt, setTyping]);

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
      const inFrame = frameId ? ({ ...shape, frameId } as Shape) : shape;
      // A note is signed by whoever put it down, where there is anyone to sign.
      const author = isNote(inFrame) ? noteAuthorRef.current : undefined;
      const placed = author ? ({ ...inFrame, author } as Shape) : inFrame;

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

      // A note is put down to be written on, so its words open at once.
      if (isNote(bound)) {
        actorRef.send({
          type: 'EDIT_TEXT_SHAPE',
          shapeId: bound.id,
          position: { x: bound.x, y: bound.y },
          existingText: '',
        });
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
      // A topic goes with everything branching from it, as a frame goes with
      // what stands in it.
      const going = withFrameMembers(withMindMapBranches(emitted.ids, current), current).filter(
        (id) => !locked.has(id),
      );
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
      setNotice(shapesNotFound());
      return;
    }
    didInitialViewFitRef.current = true;
    actorRef.send({
      type: 'SET_CAMERA',
      camera: fitRectToViewport(rect, { width, height }, { maxZoom: 1 }),
    });
  }, [arrivalLink, shapes, shownShapes, boardSynced, width, height, actorRef]);

  /**
   * The comment thread this page was opened at, from a link to it — a mention
   * email's. Held until the thread has arrived and been opened at its pin, or
   * the board has arrived in full without it.
   */
  const [arrivalThreadId, setArrivalThreadId] = useState<string | null>(() =>
    new URL(window.location.href).searchParams.get(COMMENT_PARAM),
  );

  useEffect(() => {
    if (!arrivalThreadId || width === 0 || height === 0) return;
    const thread = comments.threads.find((candidate) => candidate.id === arrivalThreadId);
    if (!thread && !boardSynced) return;

    setArrivalThreadId(null);
    // Off the address once used, as a link to shapes is.
    const here = new URL(window.location.href);
    here.searchParams.delete(COMMENT_PARAM);
    window.history.replaceState(window.history.state, '', here.href);

    if (!thread) {
      setNotice(commentNotFound());
      return;
    }
    didInitialViewFitRef.current = true;
    showCommentThread(thread);
  }, [arrivalThreadId, comments.threads, boardSynced, width, height, showCommentThread]);

  useEffect(() => {
    if (didInitialViewFitRef.current) return;
    // A link to a place on the board decides the view instead, once it can,
    // and so does one to a comment.
    if (arrivalLink || arrivalThreadId) return;
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
  }, [shownShapes, width, height, actorRef, restoredViewRef, arrivalLink, arrivalThreadId]);

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

  /**
   * Where things stood when the touch on the board went down: the edit on top
   * of the undo history, the tool, the selection. A touch can turn out to be a
   * palm the pencil arrived after, and then everything since is taken back.
   */
  const touchPressRef = useRef<{
    undoItem: object | null;
    tool: Tool;
    selectedIds: readonly string[];
  } | null>(null);

  /** The tool to go back to when a pen's eraser end lifts. */
  const eraserReturnRef = useRef<Tool | null>(null);
  /**
   * How near a shape's line the last press had to land to be on it: wider
   * for a finger or a pencil than for a mouse. Kept for what follows a press —
   * the double tap that completes it, the menu a hold opens.
   */
  const hitMarginRef = useRef(HIT_MARGIN);

  /** A press on the middle of an embed, until its lift says whether it was a click. */
  const embedPressRef = useRef<{ id: string; screen: Point; at: number } | null>(null);
  const embedActivationRef = useRef<number | undefined>(undefined);
  /** The tools a click on an embed's middle hands its page the presses under. */
  const embedClickTool = viewMode || activeTool === 'select' || activeTool === 'laser';
  /** The embed whose middle third is at `point`, topmost first, if it has a page. */
  const embedMiddleAt = useCallback(
    (point: Point): string | null => {
      const hit = hitTest(shownShapes, spatialIndex, point.x, point.y, camera.zoom, {
        margin: hitMarginRef.current,
      });
      return hit && isEmbed(hit) && resolveEmbed(hit.url) && inEmbedMiddle(hit, point.x, point.y)
        ? hit.id
        : null;
    },
    [shownShapes, spatialIndex, camera.zoom],
  );
  useEffect(() => () => window.clearTimeout(embedActivationRef.current), []);

  /**
   * Where a press with the bucket went down, until it comes up. The pour
   * waits for the lift: on the press it can't yet be told from the first
   * finger of a pinch, and a second finger, or the system taking the pointer
   * away, calls it off. Poured at the press, which is what was aimed at.
   */
  const bucketPressRef = useRef<Point | null>(null);

  const pourBucket = useCallback(
    (point: Point) => {
      if (readOnly) return;
      const outcome = planBucketFill({
        point,
        shapes: doc.getShapes(),
        hit: hitTest(pickableShapes, spatialIndex, point.x, point.y, camera.zoom, {
          margin: hitMarginRef.current,
        }),
        style: {
          fillColor: pourColor,
          fillStyle: itemStyle.fillStyle,
          opacity: itemStyle.opacity,
        },
        id: genId(),
      });
      // Each pour its own undo step, on both sides: a fill made straight after
      // drawing the outline would otherwise be taken back with it.
      switch (outcome.kind) {
        case 'create':
          doc.breakUndoGroup();
          doc.addShapeBeside(outcome.shape, outcome.placement);
          break;
        case 'restyle':
          doc.breakUndoGroup();
          doc.updateShape(outcome.id, outcome.patch);
          break;
        case 'notice':
          showToast(
            translate(
              outcome.reason === 'tooComplex'
                ? 'notices.bucketTooComplex'
                : 'notices.bucketNoRegion',
            ),
          );
          return;
        case 'none':
          return;
      }
      // The tool stays in hand and nothing is selected, so the next area is
      // one more click.
      doc.breakUndoGroup();
    },
    [
      readOnly,
      doc,
      pickableShapes,
      spatialIndex,
      camera.zoom,
      pourColor,
      itemStyle.fillStyle,
      itemStyle.opacity,
      showToast,
    ],
  );

  const handlePointerDown = useCallback(
    (
      point: Point,
      screenPoint: Point,
      button: number,
      shiftKey: boolean,
      snapOverride = false,
      pointerType = 'mouse',
    ) => {
      // A press anywhere on the board hands an embed's page back to being
      // shown, as a press outside a menu closes it. The page took the presses
      // that landed on it, so this is always one outside. A press on another
      // embed's middle is noted, to hand that one the presses if it turns out
      // to be a click.
      setActiveEmbedId(null);
      window.clearTimeout(embedActivationRef.current);
      selectionGapPressRef.current = null;
      // A press on the board puts an open link field away, as a press outside
      // a menu closes it — whatever it was waiting for is left unplaced.
      setEmbedPlacement(null);
      // The embed tool drags out the box the embed will fill, and nothing else.
      // Read off the machine rather than the render, which may not have caught
      // up with a W pressed a moment before the press.
      const embedTool = actorRef.getSnapshot().context.activeTool === 'embed';
      if (embedTool && button === 0 && !isSpacePressed && !readOnly) {
        embedDraftRef.current = { from: point, to: point };
        setEmbedDraft(embedDraftRef.current);
        return;
      }
      const embedId = button === 0 && !shiftKey && embedClickTool ? embedMiddleAt(point) : null;
      embedPressRef.current = embedId
        ? { id: embedId, screen: screenPoint, at: performance.now() }
        : null;

      // The far end of a pen that has one erases, whatever tool is in hand,
      // and the tool comes back when it lifts (see handlePointerLift). Read
      // here rather than from the render, which hasn't caught up with it yet.
      const erasing = button === PEN_ERASER_BUTTON;
      if (erasing) {
        eraserReturnRef.current = activeTool;
        actorRef.send({ type: 'SELECT_TOOL', tool: 'eraser' });
      }
      const tool: Tool = erasing ? 'eraser' : activeTool;
      const pressButton = erasing ? 0 : button;
      const margin = pointerType === 'mouse' ? HIT_MARGIN : COARSE_HIT_MARGIN;
      hitMarginRef.current = margin;
      // Its own undo step, so taking it back takes nothing else with it.
      if (pointerType === 'touch') {
        doc.breakUndoGroup();
        touchPressRef.current = {
          undoItem: doc.peekUndoItem(),
          tool: activeTool,
          selectedIds: actorRef.getSnapshot().context.selectedIds,
        };
      } else {
        touchPressRef.current = null;
      }
      notifyActivity();
      lastCanvasPointRef.current = screenPoint;
      pasteTargetRef.current = null;

      // The laser never reaches the machine. It selects nothing, draws nothing,
      // and marks nothing for erasure — letting POINTER_DOWN through would only
      // give it a marquee it has no use for.
      if (tool === 'laser') {
        laser.begin(point.x, point.y);
        setLasering(true);
        return;
      }
      // Nor does a comment being placed: the press opens its composer, which
      // follows the pointer until the button comes up. Any other button is
      // left to pan the board as it would with any tool.
      if (tool === 'comment' && pressButton === 0) {
        beginComment(point);
        return;
      }
      // Nor does the bucket. A press is only noted here; the pour happens on
      // the lift. Any other button, or one with Space held, pans as usual.
      bucketPressRef.current = null;
      if (tool === 'bucket' && pressButton === 0 && !isSpacePressed) {
        if (!readOnly) bucketPressRef.current = point;
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

      // The mind map tool puts a map's centre down where it is pressed, open
      // for its name, and is done: the map grows from the keyboard after
      // that. Any other button, or one with Space held, pans as usual.
      if (tool === 'mindmap' && pressButton === 0 && !isSpacePressed) {
        if (!readOnly) startMindMap(point);
        return;
      }

      let hitShapeId: string | null = null;
      let hitHandle: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | null = null;
      let hitVertex: VertexGrab | null = null;

      // A press anywhere puts away the padlock a click on a locked shape put
      // up; the press below decides whether to put it back.
      setActiveLock(null);
      lockPressRef.current = null;
      carriedLockedRef.current = EMPTY_IDS;

      if (tool === 'select' && !isSpacePressed && pressButton !== 1) {
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
        // The count on a folded topic opens it again.
        const foldedId =
          hitHandle === null && hitVertex === null && !readOnly && !shiftKey
            ? mindMapFoldBadgeAt(shapes, point)
            : null;
        if (foldedId && !lockedIds.has(foldedId)) {
          doc.updateShape(foldedId, { collapsed: false });
          actorRef.send({ type: 'SELECT_ALL', shapeIds: [foldedId] });
          return;
        }
        if (hitHandle === null && hitVertex === null) {
          // A locked shape is passed over for whatever is under it, as if it
          // were part of the board. The selection answers anywhere in its box,
          // so a diagonal line can be dragged by the space it spans.
          const hit = hitTest(pickableShapes, spatialIndex, point.x, point.y, camera.zoom, {
            margin,
            selectedIds,
          });
          hitShapeId = hit?.id ?? null;
          selectionGapPressRef.current =
            hit &&
            !shiftKey &&
            !hitTest(pickableShapes, spatialIndex, point.x, point.y, camera.zoom, { margin })
              ? screenPoint
              : null;

          if (hit) {
            const picked = (
              shiftKey || selectedIds.includes(hit.id)
                ? [...new Set([...selectedIds, hit.id])]
                : [hit.id]
            ).filter((id) => !lockedIds.has(id));
            // One topic off the centre of its map is dragged to a new place
            // in a map, rather than moved: nothing moves until it is let go,
            // and the layout says where everything goes when it is.
            topicDragRef.current =
              picked.length === 1 &&
              picked[0] === hit.id &&
              isTopic(hit) &&
              !readOnly &&
              withMindMapRoots([hit.id], shapes)[0] !== hit.id
                ? { id: hit.id, grab: { x: point.x - hit.x, y: point.y - hit.y }, drop: null }
                : null;
            // Dragging a frame drags what is standing in it. The members are
            // moved by the same loop as everything else, so the whole of
            // "a frame moves as one object" is this one expansion. A topic
            // drags its whole map, by its centre: the layout places the rest.
            const idsToMove = new Set(
              topicDragRef.current
                ? []
                : withFrameMembers(
                    withMindMapRoots(picked, shapes).filter((id) => !lockedIds.has(id)),
                    shapes,
                  ),
            );
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
            const locked = hitTest(shownShapes, spatialIndex, point.x, point.y, camera.zoom, {
              margin,
            });
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
      if (tool === 'select' && hitVertex !== null && vertexOriginRef.current) {
        // No arrows to settle: an end being dragged has already let go, and
        // nothing can attach itself to a line or an arrow in the first place.
        measureSnapTargets(new Set([vertexOriginRef.current.id]));
        boundArrowsRef.current = EMPTY_IDS;
      } else if (tool === 'select' && hitHandle !== null && resizeOriginRef.current) {
        const moving = new Set([resizeOriginRef.current.id]);
        measureSnapTargets(moving);
        boundArrowsRef.current = affectedArrowIds(shapes, moving);
        gestureShapesRef.current = shapeMapFor(shapes, boundArrowsRef.current);
      } else if (tool === 'select' && hitShapeId) {
        const moving = new Set(Object.keys(dragOriginsRef.current));
        measureSnapTargets(moving);
        boundArrowsRef.current = affectedArrowIds(shapes, moving);
        gestureShapesRef.current = shapeMapFor(shapes, boundArrowsRef.current);
      } else if (DRAWS_FROM_POINTER.has(tool)) {
        measureSnapTargets(new Set<string>());
        boundArrowsRef.current = EMPTY_IDS;

        // The corner a shape is drawn out from is worth snapping too: a box
        // that starts flush with its neighbour needs no nudging afterwards.
        if (snappingActive(preferences.values.snapToObjects, snapOverride)) {
          const result = snapForPointer(point, tool);
          downPoint = { x: point.x + result.dx, y: point.y + result.dy };
        }
      } else {
        snapTargetsRef.current = NO_SNAP_TARGETS;
        boundArrowsRef.current = EMPTY_IDS;
      }
      showSnapGuides(EMPTY_GUIDES);
      showBindingHint(null);
      pointerDownWorldRef.current = downPoint;

      actorRef.send({
        type: 'POINTER_DOWN',
        point: downPoint,
        button: pressButton,
        shiftKey,
        hitShapeId,
        hitHandle,
        hitVertex,
      });

      // After POINTER_DOWN, so the machine is already in `erasing` — the idle
      // state has no ERASE_MARK handler and would drop this silently.
      // A click produces no pointer move, so mark the spot directly, otherwise
      // tapping a shape would do nothing.
      if (tool === 'eraser') {
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
      doc,
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
      showBindingHint,
      preferences.values.snapToObjects,
      embedClickTool,
      embedMiddleAt,
      startMindMap,
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
        hitMarginRef.current,
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
          boards: liveBoards(boardSwitcher.boardsFor(boardSwitcher.workspaceId)),
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
      const draft = embedDraftRef.current;
      if (draft) {
        embedDraftRef.current = { from: draft.from, to: point };
        setEmbedDraft(embedDraftRef.current);
        return;
      }
      // A pen's eraser end is erasing, whatever the last render had in hand.
      const tool: Tool = eraserReturnRef.current ? 'eraser' : activeTool;

      if (tool === 'laser') {
        // Only while the button is down. A laser tracks the cursor the way a
        // real one does — it is off until you press it.
        laser.extend(point.x, point.y);
        return;
      }
      if (tool === 'comment' && isPlacingComment()) {
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

      // Where the end under the pointer would attach, shown while it moves.
      let hint: BindingHint | null = null;
      const drawn = snap.context.newElement;
      if (snap.matches('drawingShape') && drawn && isArrow(drawn) && bindArrowsRef.current) {
        hint = bindingHintAt(arrowEndsAttached(drawn, shapes), drawn.points.length - 1, shapes);
      }

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

      const topicGrab = topicDragRef.current;
      if (snap.matches('draggingSelection') && topicGrab) {
        // A press that wobbles is still a click: nothing lands until the
        // pointer has really gone somewhere.
        const start = pointerDownWorldRef.current;
        const travelled = start
          ? Math.hypot(point.x - start.x, point.y - start.y) * camera.zoom
          : 0;
        const drop = travelled > 4 ? mindMapDropAt(shownShapes, topicGrab.id, point) : null;
        topicGrab.drop = drop;
        setTopicDrag({ id: topicGrab.id, point, grab: topicGrab.grab, drop });
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
        if (isArrow(moved) && bindArrowsRef.current) {
          const index = vertexGrab.index;
          hint = bindingHintAt(reattachArrowEnd(moved, index, shapes), index, shapes);
        }

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

      showBindingHint(hint);
    },
    // The unlocked shapes, the index and the zoom feed the eraser hit-test;
    // omitting them freezes this callback on the first render's empty document.
    // The whole board feeds the arrow-end hint, which looks for what the end is
    // over by the rules release follows.
    [
      actorRef,
      activeTool,
      laser,
      isPlacingComment,
      followComment,
      doc,
      shapes,
      shownShapes,
      pickableShapes,
      spatialIndex,
      camera.zoom,
      preferences.values.snapToObjects,
      preferences.values.snapToMidpoints,
      snapForPointer,
      showSnapGuides,
      showBindingHint,
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
      setHoveredEmbedId(point ? embedMiddleAt(point) : null);

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
    [setCursor, activeTool, selectedIds, shapes, camera.zoom, embedMiddleAt],
  );

  /**
   * The first pen this device has seen puts pen mode on, and says so: from
   * then on a finger on the board does nothing, which would read as broken if
   * it came unannounced. Once only — turned off after that, it stays off.
   */
  useBoardItemTouchGuard(containerRef, preferences.values.penMode);
  const penSeenRef = useRef(readPenSeen());
  const handlePenDetected = useCallback(() => {
    if (penSeenRef.current) return;
    penSeenRef.current = true;
    storePenSeen();
    if (preferences.values.penMode) return;
    preferences.set('penMode', true);
    showToast(translate('notices.penModeOn'));
  }, [preferences, showToast]);

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
      const tool: Tool = eraserReturnRef.current ? 'eraser' : activeTool;

      if (tool === 'laser') {
        laser.end();
        setLasering(false);
        return;
      }
      if (tool === 'comment' && isPlacingComment()) {
        // Where the button comes up is where the pin goes: on the shape under
        // it, or on the board.
        settleComment(point, commentTargetAt(point, shownShapes, spatialIndex, camera.zoom));
        return;
      }
      const bucketPress = bucketPressRef.current;
      bucketPressRef.current = null;
      if (bucketPress) {
        pourBucket(bucketPress);
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
        const index = snap.context.vertexGrab?.index ?? -1;
        if (dragged && isArrow(dragged)) {
          const rebound = reattachArrowEnd(dragged, index, current);
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

      // A topic let go somewhere it can go takes its place there, branch and
      // all, in one step.
      const topicGrab = topicDragRef.current;
      topicDragRef.current = null;
      setTopicDrag(null);
      if (topicGrab?.drop && snap.matches('draggingSelection')) {
        doc.breakUndoGroup();
        doc.updateShapes(topicDropPatches(doc.getShapes(), topicGrab.id, topicGrab.drop));
        doc.breakUndoGroup();
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
      showBindingHint(null);

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
      pourBucket,
      shapes,
      shownShapes,
      spatialIndex,
      camera.zoom,
      doc,
      showSnapGuides,
      showBindingHint,
    ],
  );

  /**
   * A touch the pencil took over from: a hand that reached the board first,
   * as it does when someone settles in to write. It is ended as a lift would
   * end it, so nothing it started is left half done, and then taken back —
   * every edit it made, and the tool and selection it changed.
   */
  const handlePointerAbandon = useCallback(
    (point: Point, screenPoint: Point) => {
      // A pour not meant — a pinch's first finger, a palm — is never poured.
      bucketPressRef.current = null;
      embedPressRef.current = null;
      selectionGapPressRef.current = null;
      embedDraftRef.current = null;
      setEmbedDraft(null);
      handlePointerUp(point, screenPoint);
      const press = touchPressRef.current;
      touchPressRef.current = null;
      if (!press) return;
      for (let top = doc.peekUndoItem(); top !== press.undoItem; top = doc.peekUndoItem()) {
        doc.undo();
        // Nothing came off, so nothing more will: a read-only board.
        if (doc.peekUndoItem() === top) break;
      }
      if (actorRef.getSnapshot().context.activeTool !== press.tool) {
        actorRef.send({ type: 'SELECT_TOOL', tool: press.tool });
      }
      const present = new Set(doc.getShapes().map((shape) => shape.id));
      actorRef.send({
        type: 'SELECT_ALL',
        shapeIds: press.selectedIds.filter((id) => present.has(id)),
      });
    },
    [actorRef, doc, handlePointerUp],
  );

  /** The system took the pointer away, which is no lift for a pour to come on. */
  const handlePointerCancel = useCallback(() => {
    bucketPressRef.current = null;
  }, []);

  /** A lift, and the tool put back if it was a pen's eraser end that lifted. */
  const handlePointerLift = useCallback(
    (point: Point, screenPoint: Point) => {
      handlePointerUp(point, screenPoint);

      // The box the embed will fill has been let go: the field for its link
      // opens beside it, and the tool goes back to select, its work done.
      const draft = embedDraftRef.current;
      if (draft) {
        embedDraftRef.current = null;
        setEmbedDraft(null);
        setEmbedPlacement({
          box: embedBoxFromDrag(draft.from, point, camera.zoom, MIN_EMBED_SIZE),
        });
        actorRef.send({ type: 'SELECT_TOOL', tool: 'select' });
        return;
      }

      // A click in the empty part of the selection's box is a click on the
      // board, and lets the selection go. Only a drag from there moves it.
      const gapPress = selectionGapPressRef.current;
      selectionGapPressRef.current = null;
      if (
        gapPress &&
        Math.hypot(screenPoint.x - gapPress.x, screenPoint.y - gapPress.y) <= LOCK_CLICK_SLOP
      ) {
        actorRef.send({ type: 'DESELECT' });
      }

      // A quick press that came up where it went down, still on the middle of
      // the same embed, was a click on it: its page takes the presses from
      // here, a moment later.
      const press = embedPressRef.current;
      embedPressRef.current = null;
      if (
        press &&
        performance.now() - press.at <= EMBED_CLICK_MAX_MS &&
        Math.hypot(screenPoint.x - press.screen.x, screenPoint.y - press.screen.y) <=
          EMBED_CLICK_MAX_TRAVEL &&
        embedMiddleAt(point) === press.id
      ) {
        embedActivationRef.current = window.setTimeout(
          () => setActiveEmbedId(press.id),
          EMBED_OPEN_DELAY_MS,
        );
      }

      const back = eraserReturnRef.current;
      if (!back) return;
      eraserReturnRef.current = null;
      actorRef.send({ type: 'SELECT_TOOL', tool: back });
    },
    [actorRef, handlePointerUp, embedMiddleAt, camera.zoom],
  );

  // Double-pressing a text shape (with any tool active) reopens it for editing;
  // double-pressing anywhere else, with select in hand, starts a new one there.
  const handleDoubleClick = useCallback(
    (point: Point) => {
      // An embed's page takes the presses for anyone who can see it, viewers
      // and locked ones included: playing a video changes nothing on the board.
      const shown = hitTest(shownShapes, spatialIndex, point.x, point.y, camera.zoom, {
        margin: hitMarginRef.current,
      });
      if (shown && isEmbed(shown) && resolveEmbed(shown.url)) {
        setActiveEmbedId(shown.id);
        return;
      }
      // A link card is opened, in a tab of its own, as its badge opens it.
      const cardUrl = shown && isBookmark(shown) ? readBookmarkUrl(shown.url) : null;
      if (cardUrl) {
        window.open(cardUrl, '_blank', 'noopener,noreferrer');
        return;
      }

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

      const hit = hitTest(pickableShapes, spatialIndex, point.x, point.y, camera.zoom, {
        margin: hitMarginRef.current,
      });
      if (hit && isText(hit)) {
        actorRef.send({
          type: 'EDIT_TEXT_SHAPE',
          shapeId: hit.id,
          position: { x: hit.x, y: hit.y },
          existingText: hit.text,
        });
        return;
      }

      if (hit && isTopic(hit)) {
        editTopic(hit.id);
        return;
      }

      if (hit && isNote(hit)) {
        editNote(hit.id);
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
    [
      actorRef,
      pickableShapes,
      shownShapes,
      spatialIndex,
      camera.zoom,
      readOnly,
      activeTool,
      editTopic,
      editNote,
    ],
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
      // A comment needs someone to sign it, and people to read it.
      if (local && tool === 'comment') {
        setSignUpReason('comment');
        return;
      }
      setActiveLock(null);
      if (actorRef.getSnapshot().matches('editingText')) {
        const active = document.activeElement;
        if (active instanceof HTMLTextAreaElement) {
          active.blur();
        }
      }
      cancelEmbedPlacement();
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
      // The bucket lets the selection go: the panel then sets what it pours,
      // where a selection kept would have it restyling that shape instead.
      if (tool === 'bucket') actorRef.send({ type: 'DESELECT' });
    },
    [actorRef, handlePickImage, readOnly, viewMode, preferences, local, cancelEmbedPlacement],
  );
  /**
   * A tool's letter. B again, with the bucket already in hand, steps it on to
   * its next colour rather than picking it up a second time — the quickest way
   * to colour areas in different colours one after another.
   */
  const handleToolKey = useCallback(
    (tool: Tool) => {
      const { activeTool: current, itemStyle: style } = actorRef.getSnapshot().context;
      if (tool === 'bucket' && current === 'bucket') {
        actorRef.send({
          type: 'SET_ITEM_STYLE',
          style: { fillColor: nextBucketColor(bucketFillColor(style.fillColor)) },
        });
        return;
      }
      handleToolChange(tool);
    },
    [actorRef, handleToolChange],
  );

  // The bucket's pipette: up while Alt is held with the bucket in hand, so a
  // colour already on the board can be picked up and poured elsewhere.
  const [pipetteOpen, setPipetteOpen] = useState(false);
  /** Where the pointer last was on the page, for the pipette's swatch to start at. */
  const pagePointerRef = useRef<{ x: number; y: number } | null>(null);
  const pipetteAvailable = activeTool === 'bucket' && !readOnly;
  useEffect(() => {
    if (!pipetteAvailable) {
      setPipetteOpen(false);
      return;
    }
    const track = (event: PointerEvent) => {
      pagePointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const down = (event: KeyboardEvent) => {
      if (event.key !== 'Alt' || isTypingTarget(event.target)) return;
      // Kept from the browser, which would otherwise take the lone Alt to its
      // menu bar on the key's release.
      event.preventDefault();
      if (!event.repeat) setPipetteOpen(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      event.preventDefault();
      setPipetteOpen(false);
    };
    // Alt let go in another window never comes back as a key up here.
    const away = () => setPipetteOpen(false);
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', away);
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', away);
    };
  }, [pipetteAvailable]);
  const handlePipettePick = useCallback(
    (color: string) => actorRef.send({ type: 'SET_ITEM_STYLE', style: { fillColor: color } }),
    [actorRef],
  );
  const closePipette = useCallback(() => setPipetteOpen(false), []);
  const getBoardCanvas = useCallback(
    () => editorRef.current?.querySelector<HTMLCanvasElement>('canvas[data-layer="board"]') ?? null,
    [],
  );

  const handleEscape = useCallback(() => {
    bucketPressRef.current = null;
    setActiveLock(null);
    setActiveEmbedId(null);
    cancelEmbedPlacement();
    actorRef.send({ type: 'ESCAPE' });
    // The comment, embed and bucket tools are put down by Escape, where the
    // drawing tools stay in hand: none leaves a half-drawn shape for the key
    // to be cancelling instead.
    const tool = actorRef.getSnapshot().context.activeTool;
    if (tool === 'comment' || tool === 'embed' || tool === 'bucket') {
      actorRef.send({ type: 'SELECT_TOOL', tool: 'select' });
    }
  }, [actorRef, cancelEmbedPlacement]);
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
    // An embed's link is the page it shows, so editing it changes that page,
    // in the window it was chosen in, rather than adding a second link.
    const shape = doc.getShapes().find((s) => s.id === ids[0]);
    if (shape && isEmbed(shape)) {
      setEmbedPlacement({ editingId: shape.id });
      return;
    }
    setLinkEditingId(ids[0]!);
    linkInputRef.current?.focus();
  }, [actorRef, doc, readOnly, lockedIds]);

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
    const ids = withFrameMembers(withMindMapBranches(selectedIds, current), current);
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
  /**
   * The camera that frames these shapes in the board as it measures right now.
   *
   * Measured at the moment of asking rather than from the size last kept,
   * which can lag a layout change around the board — and with no size to fit
   * into, the shapes would be framed into nothing and land in a corner at the
   * smallest zoom. A shape whose bounds are not numbers is left out rather
   * than allowed to throw the whole frame off.
   */
  const cameraFraming = useCallback(
    (target: readonly Shape[]) => {
      const finite = target.filter((shape) => {
        const b = shapeBounds(shape);
        return [b.x, b.y, b.width, b.height].every(Number.isFinite);
      });
      const rect = computeBoundingRect(finite);
      if (!rect) return null;
      const box = containerRef.current?.getBoundingClientRect();
      const viewport =
        box && box.width > 0 && box.height > 0
          ? { width: box.width, height: box.height }
          : { width, height };
      if (viewport.width <= 0 || viewport.height <= 0) return null;
      return fitRectToViewport(rect, viewport);
    },
    [width, height],
  );

  const handleZoomToFit = useCallback(() => {
    const newCamera = cameraFraming(shownShapes);
    if (newCamera) actorRef.send({ type: 'SET_CAMERA', camera: newCamera });
  }, [actorRef, shownShapes, cameraFraming]);

  // Zoom to selection (falls back to zoom-to-fit if nothing selected)
  const handleZoomToSelection = useCallback(() => {
    const target =
      selectedIds.length > 0 ? shownShapes.filter((s) => selectedIds.includes(s.id)) : shownShapes;
    const newCamera = cameraFraming(target);
    if (newCamera) actorRef.send({ type: 'SET_CAMERA', camera: newCamera });
  }, [actorRef, shownShapes, selectedIds, cameraFraming]);

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
    adoptImages: images.adoptImages,
    fileHandleRef,
    onNotice: showOpenNotice,
  });

  // The local board, brought into the account by signing in from it.
  useCarryLocalBoard({
    ready: !local && user !== null && !user.isGuest && !user.readOnly && !readOnly && boardSynced,
    boardId,
    owns: user?.role === 'owner',
    workspaceId: authToken ? decodeJwtWorkspaceId(authToken) : null,
    doc,
    title: t('local.carry.boardTitle'),
    addBoard: boardSwitcher.addBoard,
    openBoard: boardSwitcher.openBoard,
    adoptImages: images.adoptImages,
    onCarried: (carried) => {
      handleBoardFileLoaded(carried);
      showToast(t('local.carry.done'));
    },
    onShare: () => setShareOpen(true),
    onFailed: () =>
      setNotice({
        title: t('local.carry.failedTitle'),
        body: t('local.carry.failedBody'),
        tone: 'warn',
      }),
  });

  const { saveBoardFileToDisk } = useSaveBoardFile({
    shapes,
    boardName: boardTitle,
    fileHandleRef,
    resolveDataUrls: boardPictures.resolveDataUrls,
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
   * Fingers moving the board. Pan and zoom go through the wheel's own camera
   * moves, which also end a follow. The view from before is kept, so a hand
   * that turns out to have been settling in to write can be put back.
   */
  /** The camera this instant, ahead of the render that will show it. */
  const getLiveCamera = useCallback(() => actorRef.getSnapshot().context.camera, [actorRef]);
  const touchCameraRef = useRef<Camera | null>(null);
  const touchNavigation = useMemo<TouchNavigation>(
    () => ({
      begin: () => {
        touchCameraRef.current = actorRef.getSnapshot().context.camera;
      },
      pan: handleWheelPan,
      zoom: handleWheelZoom,
      end: () => {
        touchCameraRef.current = null;
      },
      cancel: () => {
        const before = touchCameraRef.current;
        touchCameraRef.current = null;
        if (before) actorRef.send({ type: 'SET_CAMERA', camera: before });
      },
      undo: handleUndo,
      redo: handleRedo,
    }),
    [actorRef, handleWheelPan, handleWheelZoom, handleUndo, handleRedo],
  );

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
    if (!runsSharing) return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setNotice({
        title: translate('notices.linkCopied'),
        body: translate('notices.linkCopiedBody'),
        tone: 'ok',
        link: { url, copied: true },
      });
    } catch {
      setNotice({
        title: translate('notices.linkCopyFailed'),
        body: translate('notices.linkCopyFailedAddressBar'),
        tone: 'warn',
        link: { url, copied: false },
      });
    }
  }, [runsSharing]);

  /**
   * Copy a link that opens this board with the selection in view, for anyone
   * who can already open the board. Said with a toast, which asks nothing and
   * goes by itself. A copy that failed still gets the notice, which shows the
   * link so it can be copied by hand.
   */
  const handleCopyLinkToSelection = useCallback(async () => {
    if (!runsSharing) return;
    const selected = shapes.filter((shape) => selectedIds.includes(shape.id));
    if (selected.length === 0) return;
    const url = shapeLinkFor(window.location.href, selected);
    try {
      await navigator.clipboard.writeText(url);
      showToast(translate('notices.linkCopiedToClipboard'));
    } catch {
      setNotice({
        title: translate('notices.linkCopyFailed'),
        body: translate('notices.linkCopyFailedBelow'),
        tone: 'warn',
        link: { url, copied: false },
      });
    }
  }, [shapes, selectedIds, showToast, runsSharing]);

  // --- copy as --------------------------------------------------------------
  // Each copies the selection, or the board when nothing is selected: the
  // shapes showing on it, as an export takes them. Nothing here changes the
  // board, so a viewer may copy too.
  const copyData = useMemo(
    () => copyDataFor(shownShapes, selectedShapes),
    [shownShapes, selectedShapes],
  );
  const canCopyAs = copyData.length > 0;
  const canCopyAsPng = canCopyAs && canWriteClipboardItems();
  const canCopyAsText = useMemo(() => hasWords(copyData), [copyData]);
  const canCopyAsMermaid = useMemo(
    () => hasMindMap(copyData) || hasFlowchart(copyData),
    [copyData],
  );

  // A link card and an embed of the same page, each made into the other. One
  // shape, unlocked; and a card only for a page a site lets the board show.
  const convertible =
    !readOnly && selectedShapes.length === 1 && editableIds.length === 1
      ? selectedShapes[0]!
      : null;
  const canConvertToEmbed =
    convertible !== null && isBookmark(convertible) && resolveEmbed(convertible.url) !== null;
  const canConvertToLinkCard =
    convertible !== null && isEmbed(convertible) && resolveEmbed(convertible.url) !== null;
  const handleConvertToEmbed = useCallback(() => {
    if (!convertible || !isBookmark(convertible)) return;
    const embed = resolveEmbed(convertible.url);
    if (!embed) return;
    // Kept in the card's box: the card was sized where it stands.
    replaceShape(
      convertible,
      createEmbed({
        id: genId(),
        x: convertible.x,
        y: convertible.y,
        width: convertible.width,
        height: convertible.height,
        url: embed.url,
        // What the card already knows about the page is the embed's still.
        title: convertible.title,
        poster: readPreviewImageName(convertible.image),
      }),
    );
  }, [convertible, replaceShape]);
  const handleConvertToLinkCard = useCallback(() => {
    if (!convertible || !isEmbed(convertible)) return;
    const url = readBookmarkUrl(convertible.url);
    if (!url) return;
    replaceShape(
      convertible,
      createBookmark({
        id: genId(),
        x: convertible.x,
        y: convertible.y,
        width: Math.max(MIN_BOOKMARK_WIDTH, convertible.width),
        height: Math.max(MIN_BOOKMARK_HEIGHT, convertible.height),
        url,
      }),
    );
  }, [convertible, replaceShape]);

  /** Said once the clipboard has it: "Copied selection as PNG". */
  const showCopied = useCallback(
    (format: string) => {
      track('copied_as', { format });
      const shown = format === 'text' ? translate('copy.formatText') : format;
      const subject = copySubjectFor(selectedShapes);
      showToast(
        translate(
          subject === 'board'
            ? 'copy.copiedBoard'
            : subject === 'frame'
              ? 'copy.copiedFrame'
              : 'copy.copiedSelection',
          { format: shown },
        ),
      );
    },
    [selectedShapes, showToast],
  );
  const showCopyFailed = useCallback(
    (err: unknown) => {
      // The clipboard's own refusals are DOMExceptions worded for developers;
      // ours are worded for the person copying.
      const ours = err instanceof Error && !(err instanceof DOMException);
      showToast(
        err instanceof ExportTooLargeError
          ? translate('copy.tooLarge')
          : ours
            ? err.message
            : translate('copy.failed'),
        'warn',
      );
    },
    [showToast],
  );

  /**
   * An image as the screen shows it: the theme on screen and its background.
   * Export image is where to choose otherwise.
   */
  const copyImageSettings = useCallback(
    (scale: number, region: ExportScope['region']): ImageExportSettings => ({
      scale,
      withBackground: true,
      dark: presenceTheme === 'dark',
      embedScene: false,
      backgroundColor: canvasBackgroundFor(presenceTheme),
      region,
    }),
    [presenceTheme],
  );

  /**
   * At twice the size, so it pastes sharp on a sharp screen — or once, where
   * twice is more than a canvas holds. Handed to the clipboard before the PNG
   * is encoded: Safari refuses a write that waits for it.
   */
  const handleCopyAsPng = useCallback(() => {
    const { shapes: drawn, region } = exportScopeFor(shownShapes, selectedShapes);
    if (drawn.length === 0 && !region) return;
    const render = (scale: number) =>
      renderExportCanvas(drawn, copyImageSettings(scale, region), boardPictures.cache).canvas;

    let canvas: HTMLCanvasElement;
    try {
      try {
        canvas = render(2);
      } catch (err) {
        if (!(err instanceof ExportTooLargeError)) throw err;
        canvas = render(1);
      }
    } catch (err) {
      showCopyFailed(err);
      return;
    }
    copyPngToClipboard(canvasToPngBlob(canvas)).then(() => showCopied('PNG'), showCopyFailed);
  }, [shownShapes, selectedShapes, copyImageSettings, boardPictures, showCopied, showCopyFailed]);

  /** The SVG element alone. Images go in as their stored bytes, so a vector stays one. */
  const handleCopyAsSvg = useCallback(() => {
    const { shapes: drawn, region } = exportScopeFor(shownShapes, selectedShapes);
    if (drawn.length === 0 && !region) return;
    const svg = boardPictures
      .resolveDataUrls(drawn)
      .then((dataUrls) => svgMarkup(drawn, copyImageSettings(1, region), dataUrls));
    writeLateTextToClipboard(svg).then(() => showCopied('SVG'), showCopyFailed);
  }, [shownShapes, selectedShapes, boardPictures, copyImageSettings, showCopied, showCopyFailed]);

  const copyAsPlainText = useCallback(
    (text: string, format: string) => {
      const written =
        navigator.clipboard?.writeText(text) ??
        Promise.reject(new Error(translate('copy.noClipboard')));
      written.then(() => showCopied(format), showCopyFailed);
    },
    [showCopied, showCopyFailed],
  );

  const handleCopyAsText = useCallback(() => {
    if (canCopyAsText) copyAsPlainText(copyTextOf(copyData), 'text');
  }, [canCopyAsText, copyData, copyAsPlainText]);

  const handleCopyAsMermaid = useCallback(() => {
    // A mind map copies as Mermaid's own mind map; anything else as a
    // flowchart, which is all the rest of the board can be.
    const chart = hasMindMap(copyData)
      ? mindMapMermaid(copyData.filter(isTopic))
      : mermaidFlowchart(copyData);
    if (chart !== null) copyAsPlainText(chart, 'Mermaid');
  }, [copyData, copyAsPlainText]);

  const handleCopyAsJson = useCallback(() => {
    if (canCopyAs) copyAsPlainText(copyJsonOf(copyData), 'JSON');
  }, [canCopyAs, copyData, copyAsPlainText]);

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
        imagesLeftOut > 0 ? translate('libraryAdd.noImages') : translate('libraryAdd.nothing'),
        'warn',
      );
      return;
    }
    try {
      await addToLibrary(kept, libraryItemName(kept));
      track('library_item_added');
      showToast(
        imagesLeftOut === 0
          ? translate('libraryAdd.added')
          : translate('libraryAdd.addedWithout', { count: imagesLeftOut }),
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : translate('library.addFailed'), 'warn');
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
      track('library_item_placed');
    },
    [readOnly, viewportCentre, doc, actorRef, markLibraryUsed],
  );

  /**
   * Put a generated diagram on the board: laid out afresh from its lines, so
   * every insert gets its own shapes, centred in the view, selected, and one
   * undo step — the same as placing a library item. The panel closes so the
   * diagram can be seen, and its icons upload as pictures pasted in do.
   */
  const { adoptImages, cache: imageCache } = images;
  // A generated diagram is drawn the way the style panel would draw a shape
  // now, so it matches what the person draws by hand beside it.
  const diagramStyle = useMemo<DiagramStyle>(
    () => ({
      strokeWidth: itemStyle.strokeWidth,
      strokeStyle: itemStyle.strokeStyle,
      roughness: itemStyle.roughness,
      edges: itemStyle.edges,
      fillStyle: itemStyle.fillStyle,
      filled: itemStyle.fillColor !== null,
      fontFamily: itemStyle.fontFamily,
      fontSize: itemStyle.fontSize,
      arrowhead: itemStyle.endArrowhead,
    }),
    [itemStyle],
  );
  const markDiagramInserted = diagrams.markInserted;

  /** Selects shapes a diagram placed, and fits them in view when they are bigger than it. */
  const selectPlacedDiagram = useCallback(
    (placed: readonly Shape[]) => {
      actorRef.send({ type: 'SELECT_ALL', shapeIds: placed.map((shape) => shape.id) });
      const rect = computeBoundingRect(placed);
      if (
        rect &&
        (rect.width * camera.zoom > width * 0.9 || rect.height * camera.zoom > height * 0.85)
      ) {
        actorRef.send({
          type: 'SET_CAMERA',
          camera: fitRectToViewport(rect, { width, height }),
        });
      }
    },
    [actorRef, camera, width, height],
  );

  /** How a mind map from the AI panel is drawn: in the layout, lines and outline the panel shows. */
  const mindMapLook = useCallback(() => {
    const { mapLayout, mapLines, topicShape } = actorRef.getSnapshot().context.itemStyle;
    return { mapLayout, mapLines, topicShape };
  }, [actorRef]);

  const insertDiagram = useCallback(
    async (entry: DiagramEntry) => {
      if (readOnly) return;
      const { shapes, icons, pictures } = await composeDiagram(entry.lines, genId, {
        style: diagramStyle,
        scale: newShapeScale(camera, preferences.values.dynamicSize),
        mindMap: mindMapLook(),
      });
      const centre = {
        x: camera.x + width / 2 / camera.zoom,
        y: camera.y + height / 2 / camera.zoom,
      };
      const placed = shapesCentredOn(shapes, centre, doc.getShapes());
      if (placed.length === 0) return;
      // The icons are already drawn, so they paint at once rather than being
      // asked of storage before their upload has landed.
      for (const [fileId, picture] of pictures) imageCache.put(fileId, picture);
      doc.batch(() => {
        for (const shape of placed) doc.addShape(shape);
      });
      void adoptImages(icons);
      markDiagramInserted(
        entry.id,
        placed.map((shape) => shape.id),
      );
      setDiagramsOpen(false);
      setDiagramsMinimized(false);
      selectPlacedDiagram(placed);
      track('diagram_inserted', { change: Boolean(entry.changeOf) });
    },
    [
      mindMapLook,
      readOnly,
      width,
      height,
      camera,
      doc,
      adoptImages,
      imageCache,
      diagramStyle,
      preferences.values.dynamicSize,
      markDiagramInserted,
      selectPlacedDiagram,
    ],
  );

  /**
   * One version on the board swapped for another, where the first stands:
   * its shapes go, the new ones are centred on the same spot, and one undo
   * brings the old one back. Locked shapes stay, as they do from a delete.
   */
  const replaceDiagram = useCallback(
    async (entry: DiagramEntry, previous: DiagramEntry) => {
      if (readOnly) return;
      const current = doc.getShapes();
      const locked = lockedShapeIds(current);
      const old = new Set(previous.inserted ?? []);
      const leaving = current.filter((shape) => old.has(shape.id) && !locked.has(shape.id));
      const rect = computeBoundingRect(leaving);
      if (!rect) {
        void insertDiagram(entry);
        return;
      }
      const { shapes, icons, pictures } = await composeDiagram(entry.lines, genId, {
        style: diagramStyle,
        scale: newShapeScale(camera, preferences.values.dynamicSize),
        mindMap: mindMapLook(),
      });
      const going = leaving.map((shape) => shape.id);
      const goingSet = new Set(going);
      const placed = shapesCentredOn(
        shapes,
        { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
        doc.getShapes().filter((shape) => !goingSet.has(shape.id)),
      );
      if (placed.length === 0) return;
      for (const [fileId, picture] of pictures) imageCache.put(fileId, picture);
      const shapesById = new Map(current.map((shape) => [shape.id, shape]));
      comments.store.holdPins(goingSet, (thread) => anchorPoint(thread.anchor, shapesById));
      doc.batch(() => {
        releaseArrowsFrom(doc, going);
        doc.deleteShapes(going);
        for (const shape of placed) doc.addShape(shape);
      });
      void adoptImages(icons);
      markDiagramInserted(
        entry.id,
        placed.map((shape) => shape.id),
      );
      setDiagramsOpen(false);
      setDiagramsMinimized(false);
      selectPlacedDiagram(placed);
      track('diagram_inserted', { change: true });
    },
    [
      mindMapLook,
      readOnly,
      doc,
      camera,
      diagramStyle,
      preferences.values.dynamicSize,
      imageCache,
      comments.store,
      adoptImages,
      markDiagramInserted,
      insertDiagram,
      selectPlacedDiagram,
    ],
  );

  /** The shapes a diagram placed, selected and in view, with the panel put away. */
  const showDiagramOnBoard = useCallback(
    (entry: DiagramEntry) => {
      const ids = new Set(entry.inserted ?? []);
      const there = doc.getShapes().filter((shape) => ids.has(shape.id));
      if (there.length === 0) return;
      setDiagramsMinimized(true);
      selectPlacedDiagram(there);
    },
    [doc, selectPlacedDiagram],
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
        setNotice(shapesNotFound());
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

  const selectionHasTopic = useMemo(
    () => shapes.some((shape) => isTopic(shape) && selectedIds.includes(shape.id)),
    [shapes, selectedIds],
  );
  /**
   * Pick out every topic further out along the selected ones, as well as them
   * — what restyling a branch wants. Folded topics stay out, as they are out
   * of sight, and so do locked ones, as they could not be changed anyway.
   */
  const handleSelectBranch = useCallback(() => {
    const branch = new Set(withMindMapBranches(selectedIds, shapes));
    const picked = pickableShapes.filter((shape) => branch.has(shape.id)).map((shape) => shape.id);
    actorRef.send({ type: 'SELECT_ALL', shapeIds: picked });
  }, [actorRef, selectedIds, shapes, pickableShapes]);

  const handleCopy = useCallback(async () => {
    if (selectedIds.length === 0) return;
    // A topic is copied with its branch, as it is deleted with it.
    const copied = new Set(withMindMapBranches(selectedIds, shapes));
    const selectedShapes = shapes.filter((s) => copied.has(s.id));
    await writeShapesToClipboard(selectedShapes);
  }, [shapes, selectedIds]);

  const handleCut = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const copied = new Set(withMindMapBranches(selectedIds, shapes));
    const selectedShapes = shapes.filter((s) => copied.has(s.id));
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

      // An SVG copied as text — from Copy as SVG or anywhere else — is the
      // picture, not its markup.
      if (content.kind === 'svg') {
        if (readOnly) return false;
        handleInsertImages([content.file], at);
        return true;
      }

      // Words pasted with one topic selected grow under it, an indented list
      // as branches of branches — however the list was copied, from wherever.
      if (content.kind === 'text' && !readOnly && !at) {
        const { selectedIds: picked } = actorRef.getSnapshot().context;
        const current = doc.getShapes();
        const parent =
          picked.length === 1 ? current.find((shape) => shape.id === picked[0]) : undefined;
        const outline = parent && isTopic(parent) ? parseOutline(content.text) : null;
        if (parent && isTopic(parent) && outline && !lockedShapeIds(current).has(parent.id)) {
          const grown = topicsFromOutline(current, parent.id, outline, genId);
          doc.breakUndoGroup();
          doc.batch(() => {
            if (parent.collapsed === true) doc.updateShape(parent.id, { collapsed: false });
            for (const topic of grown) doc.addShape(topic);
          });
          doc.breakUndoGroup();
          actorRef.send({
            type: 'SELECT_ALL',
            shapeIds: grown.filter((topic) => topic.parentId === parent.id).map((t) => t.id),
          });
          return true;
        }
      }

      // A link to a page a site lets the board show is pasted as that page,
      // not as its address written out.
      const embedUrl = content.kind === 'text' && !readOnly ? parseEmbedInput(content.text) : null;
      if (embedUrl) {
        insertEmbed(embedUrl, at);
        return true;
      }
      // Any other web address pasted on its own is a card for its page.
      const cardUrl = content.kind === 'text' && !readOnly ? pastedLinkCardUrl(content.text) : null;
      if (cardUrl) {
        insertLinkCard(cardUrl, at);
        return true;
      }

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
    [
      doc,
      actorRef,
      readOnly,
      handleInsertImages,
      insertEmbed,
      insertLinkCard,
      textShapeFromClipboard,
      viewportCentre,
    ],
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
      setNotice(pasteNotice(Boolean(at)));
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
  const pointerSpot = useCallback((): Point => {
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
    return at;
  }, [lastPointerPosition, camera, viewportCentre]);

  const handlePasteHere = useCallback(
    () => pasteFromMenu(pointerSpot()),
    [pasteFromMenu, pointerSpot],
  );

  /** A new map from an outline, its centre on `at`, added as one step and selected. */
  const placeMindMapFromOutline = useCallback(
    (outline: ReturnType<typeof parseOutline>, at: Point, replacing?: string) => {
      if (!outline) return false;
      const { itemStyle: style, camera: view, dynamicSize } = actorRef.getSnapshot().context;
      const topics = mindMapFromOutline(
        outline,
        at,
        style,
        newShapeScale(view, dynamicSize),
        translate('mindMap.defaultCentre'),
        genId,
      );
      doc.breakUndoGroup();
      doc.batch(() => {
        if (replacing) doc.deleteShapes([replacing]);
        for (const topic of topics) doc.addShape(topic);
      });
      doc.breakUndoGroup();
      actorRef.send({ type: 'SELECT_ALL', shapeIds: topics[0] ? [topics[0].id] : [] });
      return true;
    },
    [actorRef, doc],
  );

  /**
   * Whatever words are on the clipboard as a new mind map, where the menu was
   * opened: an indented list as branches of branches, plain lines each a
   * branch of their own.
   */
  const handlePasteAsMindMap = useCallback(async () => {
    if (readOnly) return;
    const at = pointerSpot();
    let raw = '';
    try {
      raw = (await navigator.clipboard?.readText()) ?? '';
    } catch {
      // Refused, or not on offer here: said below as nothing to paste.
    }
    if (!placeMindMapFromOutline(parseOutline(raw), at)) {
      showToast(translate('mindMap.nothingToPaste'), 'warn');
    }
  }, [readOnly, pointerSpot, placeMindMapFromOutline, showToast]);

  /** The one text box selected, which Turn into mind map reads its list from. */
  const selectedTextBox = useMemo(() => {
    if (selectedIds.length !== 1 || lockedIds.has(selectedIds[0]!)) return null;
    const shape = shapes.find((s) => s.id === selectedIds[0]);
    return shape && isText(shape) && shape.text.trim() !== '' ? shape : null;
  }, [selectedIds, lockedIds, shapes]);

  /**
   * Ideas for the one topic selected, from the AI, hung under it in one step.
   * It is told the path down from the map's centre and what is under the
   * topic already, so the ideas fit where they go and repeat nothing. One of
   * the month's AI diagrams, given back if nothing comes.
   */
  const expandingRef = useRef(false);
  const handleExpandWithAi = useCallback(async () => {
    if (readOnly || selectedIds.length !== 1) return;
    if (local) {
      setSignUpReason('diagram');
      return;
    }
    if (!authToken || !accountHere || expandingRef.current) return;
    const forest = mindMapForest(doc.getShapes());
    const topic = forest.topics.get(selectedIds[0]!);
    if (!topic || topic.text.trim() === '') return;

    const path: string[] = [];
    const seen = new Set<string>([topic.id]);
    let above = topic.parentId === null ? undefined : forest.topics.get(topic.parentId);
    while (above && !seen.has(above.id)) {
      seen.add(above.id);
      path.unshift(above.text);
      above = above.parentId === null ? undefined : forest.topics.get(above.parentId);
    }
    const children = (forest.children.get(topic.id) ?? []).map((child) => child.text);
    const name = topic.text.replace(/\s+/g, ' ').trim();

    expandingRef.current = true;
    showToast(translate('mindMap.expanding', { topic: name }));
    try {
      const outcome = await expandTopic(
        authToken,
        { boardId, topic: topic.text, path, children },
        new AbortController().signal,
      );
      if (outcome.kind === 'refused') {
        const { code } = outcome.refusal;
        if (code === 'sign-in-required') setSignUpReason('diagram');
        else
          showToast(
            code === DIAGRAM_LIMIT_REACHED
              ? translate('mindMap.expandLimit')
              : translate('mindMap.expandFailed'),
            'warn',
          );
        return;
      }
      if (outcome.kind === 'cut') {
        showToast(translate('mindMap.expandCut'), 'warn');
        return;
      }
      diagrams.noteUsage(outcome.end.usage);
      track('mind_map_expanded', { ok: outcome.end.ok, ideas: outcome.ideas.length });
      // The topic may have gone while the ideas were on their way.
      const current = doc.getShapes();
      const still = current.find((shape) => shape.id === topic.id);
      if (!outcome.end.ok || outcome.ideas.length === 0 || !still || !isTopic(still)) {
        showToast(translate('mindMap.noNewIdeas', { topic: name }), 'warn');
        return;
      }
      const grown = topicsFromOutline(
        current,
        still.id,
        outcome.ideas.map((text) => ({ text, children: [] })),
        genId,
      );
      doc.breakUndoGroup();
      doc.batch(() => {
        if (still.collapsed === true) doc.updateShape(still.id, { collapsed: false });
        for (const idea of grown) doc.addShape(idea);
      });
      doc.breakUndoGroup();
      actorRef.send({ type: 'SELECT_ALL', shapeIds: grown.map((idea) => idea.id) });
      showToast(translate('mindMap.expanded', { count: grown.length, topic: name }));
    } catch {
      showToast(translate('mindMap.expandCut'), 'warn');
    } finally {
      expandingRef.current = false;
    }
  }, [
    readOnly,
    selectedIds,
    local,
    authToken,
    accountHere,
    doc,
    boardId,
    showToast,
    diagrams,
    actorRef,
  ]);

  /** The selected text box as a map, standing where it stood — one undo puts the text back. */
  const handleTurnIntoMindMap = useCallback(() => {
    if (readOnly || !selectedTextBox) return;
    const bounds = shapeBounds(selectedTextBox);
    placeMindMapFromOutline(
      parseOutline(selectedTextBox.text),
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      selectedTextBox.id,
    );
  }, [readOnly, selectedTextBox, placeMindMapFromOutline]);

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

  /** The local board has no account to spend diagrams from, so it asks for one. */
  const toggleDiagrams = useCallback(() => {
    if (local) {
      setSignUpReason('diagram');
      return;
    }
    // Minimized, the button brings the panel back rather than closing it.
    if (diagramsOpen && diagramsMinimized) setDiagramsMinimized(false);
    else {
      setDiagramsMinimized(false);
      setDiagramsOpen((open) => !open);
    }
  }, [local, diagramsOpen, diagramsMinimized]);
  const closeDiagrams = useCallback(() => {
    setDiagramsOpen(false);
    setDiagramsMinimized(false);
  }, []);
  const minimizeDiagrams = useCallback(() => setDiagramsMinimized(true), []);
  // Which diagrams are on the board is read off it while the panel is open.
  const boardShapeIds = useMemo(
    () => (diagramsOpen ? new Set(shapes.map((shape) => shape.id)) : EMPTY_IDS),
    [diagramsOpen, shapes],
  );
  const restoreDiagrams = useCallback(() => setDiagramsMinimized(false), []);
  const signInForDiagrams = useCallback(() => {
    window.location.assign(new URL('/login?next=/open', env.VITE_WEB_URL).toString());
  }, []);
  const showPlans = useCallback(() => {
    window.open(new URL('/#pricing', env.VITE_WEB_URL).toString(), '_blank', 'noopener');
  }, []);

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
    onSelectTool: handleToolKey,
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
    onCopyAsPng: handleCopyAsPng,
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
    onGrowMindMap: handleGrowSelectedTopic,
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
      signUpReason !== null ||
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
      toggleDiagrams,
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
      copyAsPng: handleCopyAsPng,
      copyAsSvg: handleCopyAsSvg,
      copyAsText: handleCopyAsText,
      copyAsMermaid: handleCopyAsMermaid,
      copyAsJson: handleCopyAsJson,
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
      canCopyAs,
      canCopyAsPng,
      canCopyAsText,
      canCopyAsMermaid,
      canShareLinks: runsSharing,
      hasAccount: !local,
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
        if (editing && isTopic(editing)) {
          // Held selected afterwards, as a text box just typed is. One left
          // empty is gone, and its parent is picked up again instead — where
          // the next Tab or Enter carries on from.
          const kept = settleTopicText(editing, text);
          actorRef.send({ type: 'COMMIT_TEXT', text, ...(kept && { shapeId: editingId }) });
          const held = kept ? editingId : editing.parentId;
          if (held && doc.getShapes().some((shape) => shape.id === held)) {
            actorRef.send({ type: 'SELECT_ALL', shapeIds: [held] });
          }
          return;
        }
        if (editing && isNote(editing)) {
          // Kept however little is on it: an empty note is still a note,
          // put down to be written on. Held selected, as text just typed is.
          if (text !== editing.text) doc.updateShape(editingId, { text });
          actorRef.send({ type: 'COMMIT_TEXT', text, shapeId: editingId });
          return;
        }
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
    [actorRef, doc, settleTopicText],
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
    bucket: editingBucket,
  };

  return (
    <div
      ref={editorRef}
      className="cf-editor"
      data-theme={resolvedTheme}
      // Read by global.css, which hides the sidebar on it. The chrome drawn
      // below is simply left out of the tree instead.
      data-chrome-hidden={chromeHidden ? '' : undefined}
      // Read by global.css too: the sidebar steps aside while the diagrams
      // panel is open, and is back once it is closed or minimized.
      data-diagrams-open={
        diagramsOpen && !diagramsMinimized && !chromeHidden && !readOnly && !local ? '' : undefined
      }
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
      <SidebarProvider
        defaultOpen={sidebarDefaultOpen}
        defaultWidth={sidebarDefaultWidth}
        className="h-full min-h-0"
      >
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
            // Left out for anyone who does not run the board's sharing.
            copyLink: runsSharing ? handleCopyBoardLink : false,
            /* Live on an empty board too — it recentres the view as well as
               clearing, so it always does something. Null for a viewer, whose
               edits the document refuses anyway. */
            resetCanvas: readOnly ? null : showReset,
            commandPalette: togglePalette,
            findOnCanvas: search.openSearch,
            help: handleShowHelp,
            // The local board has no account to set up or leave; it offers
            // one, or the account's own boards to someone signed in.
            settings: local ? false : showSettings,
            signOut: local ? false : showSignOut,
            ...(local &&
              (signedIn
                ? { yourBoards: () => leaveForAccount('yourBoards') }
                : {
                    signIn: () => leaveForAccount('signIn'),
                    signUp: () => leaveForAccount('signUp'),
                  })),
          }}
        />

        {/* The canvas and everything floating over it. Positioned, so the
            chrome inside anchors to the space left of the sidebar rather than
            to the window — and measured, so the canvas resizes with it. */}
        <SidebarInset className="relative min-w-0 overflow-hidden">
          <div ref={containerRef} className="cf-board absolute inset-0">
            {/* Around the canvas alone, so a right-click on the chrome floating
                over it still gets the browser's own menu, or none. Rows go live
                by being given a handler here; the rest read "Soon". */}
            <CanvasContextMenu
              target={contextMenuTarget}
              readOnly={readOnly}
              canShareLinks={runsSharing}
              mindMap={selectionHasTopic}
              moveTo={moveToBoards}
              open={contextMenuOpen}
              onOpenChange={handleContextMenuOpenChange}
              container={editorRoot}
              actions={{
                // Locked shapes can be copied and duplicated — the copies come
                // out unlocked — but nothing that would change them is offered.
                selectBranch: selectionHasTopic ? handleSelectBranch : null,
                expandWithAi:
                  selectedIds.length === 1 && selectionHasTopic && editableIds.length === 1
                    ? () => void handleExpandWithAi()
                    : null,
                cut: editableIds.length > 0 ? handleCut : null,
                copy: selectedIds.length > 0 ? handleCopy : null,
                paste: handlePaste,
                pasteHere: handlePasteHere,
                pasteAsMindMap: handlePasteAsMindMap,
                turnIntoMindMap: selectedTextBox ? handleTurnIntoMindMap : null,
                duplicate: selectedIds.length > 0 ? handleDuplicate : null,
                flipHorizontal: canFlip ? handleFlipHorizontal : null,
                flipVertical: canFlip ? handleFlipVertical : null,
                // A link belongs to one shape, as its box does.
                addLink:
                  selectedIds.length === 1 && editableIds.length === 1 ? handleEditLink : null,
                copyLinkToSelection: selectedIds.length > 0 ? handleCopyLinkToSelection : null,
                // The account's, not the board's: a viewer may keep things too.
                addToLibrary: libraryEnabled && selectedIds.length > 0 ? handleAddToLibrary : null,
                copyAsPng: canCopyAsPng ? handleCopyAsPng : null,
                copyAsSvg: canCopyAs ? handleCopyAsSvg : null,
                copyAsText: canCopyAsText ? handleCopyAsText : null,
                copyAsMermaid: canCopyAsMermaid ? handleCopyAsMermaid : null,
                copyAsJson: canCopyAs ? handleCopyAsJson : null,
                convertToEmbed: canConvertToEmbed ? handleConvertToEmbed : null,
                convertToBookmark: canConvertToLinkCard ? handleConvertToLinkCard : null,
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
                addLink:
                  linkShape && isEmbed(linkShape)
                    ? t('embeds.editLink')
                    : linkShape?.link
                      ? t('commands.editLink')
                      : t('contextMenu.addLink'),
                lock: selectionLocked ? t('lock.unlock') : t('contextMenu.lock'),
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
                  editingTopicId={editingTopic?.id}
                  editingNoteId={editingNote?.id}
                  newElement={newElement}
                  selectedIds={selectedIdsForRender}
                  marquee={marquee}
                  images={boardPictures.cache}
                  imageRevision={pictureRevision}
                  darkMode={resolvedTheme === 'dark'}
                  onDropFiles={readOnly ? undefined : handleInsertImages}
                  onDropLibraryItem={readOnly ? undefined : handleDropLibraryItem}
                  activeTool={activeTool}
                  camera={camera}
                  getCamera={getLiveCamera}
                  isSpacePressed={isSpacePressed}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerLift}
                  longPressMenu={activeTool === 'select'}
                  toolCursor={
                    activeTool === 'bucket'
                      ? bucketCursorValue(pourColor, resolvedTheme === 'dark')
                      : undefined
                  }
                  onPointerAbandon={handlePointerAbandon}
                  onPointerCancel={handlePointerCancel}
                  onContextPress={handleContextPress}
                  onDoubleClick={handleDoubleClick}
                  onWheelZoom={handleWheelZoom}
                  onWheelPan={handleWheelPan}
                  isPanning={isPanning}
                  backgroundColor={canvasBackgroundFor(presenceTheme)}
                  showGrid={preferences.values.showGrid}
                  searchHighlights={search.highlights}
                  snapGuides={snapGuides}
                  bindingHint={bindingHint}
                  hoveredHandleId={hoveredHandleId}
                  lockedIds={lockedIds}
                  lockHighlightIds={padlock ? padlock.ids : undefined}
                  peersRef={peersRef}
                  subscribePeers={subscribe}
                  onPointerHover={handlePointerHover}
                  penMode={preferences.values.penMode}
                  onPenDetected={handlePenDetected}
                  touchNavigation={touchNavigation}
                  overEmbed={embedClickTool && hoveredEmbedId !== null}
                />
                {pipetteOpen && (
                  <BucketEyedropper
                    getCanvas={getBoardCanvas}
                    ground={canvasBackgroundFor(presenceTheme)}
                    darkMode={resolvedTheme === 'dark'}
                    initialPoint={pagePointerRef.current}
                    onPick={handlePipettePick}
                    onCancel={closePipette}
                  />
                )}
              </div>
            </CanvasContextMenu>

            {waitingForBoard && <BoardLoading overlay />}

            {/* The page of every embed on screen, live over its card. Under
                the link badges and the comment pins, which belong to the
                shapes rather than to the pages. */}
            <EmbedLayer
              shapes={shownShapes}
              camera={camera}
              board={screen}
              activeId={activeEmbedId}
              hoveredId={embedClickTool ? hoveredEmbedId : null}
            />

            {/* Placing an embed: the hint while the tool is in hand, the box
                being dragged out, and the field for its link. */}
            <EmbedPlacer
              armed={activeTool === 'embed'}
              frame={
                embedDraft
                  ? embedScreenBox(
                      {
                        x: Math.min(embedDraft.from.x, embedDraft.to.x),
                        y: Math.min(embedDraft.from.y, embedDraft.to.y),
                        width: Math.abs(embedDraft.to.x - embedDraft.from.x),
                        height: Math.abs(embedDraft.to.y - embedDraft.from.y),
                      },
                      camera,
                    )
                  : embedPlacement && 'box' in embedPlacement
                    ? embedScreenBox(embedPlacement.box, camera)
                    : null
              }
              field={
                embedPlacement && 'box' in embedPlacement
                  ? { anchor: embedScreenBox(embedPlacement.box, camera), editing: null }
                  : embedEditingShape
                    ? {
                        anchor: embedScreenBox(embedEditingShape, camera),
                        editing: embedEditingShape.url,
                      }
                    : null
              }
              board={screen}
              onSubmit={handleEmbedLink}
              onSubmitCard={handleLinkCardFromField}
              onCancel={cancelEmbedPlacement}
            />

            {selectedTopic && (
              <TopicHandles
                topic={selectedTopic.topic}
                camera={camera}
                isRoot={selectedTopic.isRoot}
                growth={selectedTopic.growth}
                hasBranches={selectedTopic.hasBranches}
                onGrow={(growth) => growMindMap(selectedTopic.topic.id, growth)}
                onFold={() => {
                  doc.breakUndoGroup();
                  doc.updateShape(selectedTopic.topic.id, { collapsed: true });
                }}
              />
            )}

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
                onMentioned={reportCommentMentions}
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
              {!chromeHidden && !local && (
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
              {!chromeHidden && !readOnly && (
                <DiagramsButton
                  open={diagramsOpen && !diagramsMinimized}
                  onToggle={toggleDiagrams}
                  onWarm={accountHere ? diagrams.warmUsage : undefined}
                />
              )}
              {chromeHidden ? (
                <ExitModeButton mode={viewMode ? 'view' : 'focus'} onExit={exitMode} />
              ) : (
                <>
                  {local && <LocalAccountButton signedIn={signedIn} />}
                  <PeerList
                    // Nobody else can be on the local board, and its one
                    // person has no account to show a face for.
                    roster={local ? [] : roster}
                    boardId={boardId}
                    authToken={authToken}
                    theme={presenceTheme}
                    following={follow.following}
                    onFollow={follow.follow}
                    onStopFollowing={follow.stop}
                    onShare={showShare}
                    readOnly={readOnly}
                    archived={
                      !local && user?.archived
                        ? { canUnarchive: runsSharing, onUnarchive: unarchiveOpenBoard }
                        : null
                    }
                    portalContainer={editorRoot}
                  />
                </>
              )}
            </div>

            {!chromeHidden && !readOnly && !local && diagramsOpen && (
              <DiagramPanel
                panel={diagrams}
                theme={presenceTheme}
                canDraw={accountHere}
                onInsert={insertDiagram}
                onSignIn={signInForDiagrams}
                onUpgrade={showPlans}
                onClose={closeDiagrams}
                minimized={diagramsMinimized}
                onMinimize={minimizeDiagrams}
                onRestore={restoreDiagrams}
                profile={
                  chromeUser ? { name: chromeUser.name, avatarUrl: chromeUser.avatarUrl } : null
                }
                boardShapeIds={boardShapeIds}
                onShowOnBoard={showDiagramOnBoard}
                onReplace={(entry, previous) => void replaceDiagram(entry, previous)}
                drawStyle={diagramStyle}
              />
            )}

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
                <GlassDock aria-label={t('toolbar.editingTools')}>
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
            {/* The same corner holds the product's mark whenever the strip
                isn't there. */}
            {!preferences.values.canvasStats && !chromeHidden && <CornerMark canvasWidth={width} />}
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

            {editingNote && noteEditor && (
              <NoteEditor
                key={textEditingKeyRef.current}
                {...noteEditor}
                fontFamily={editingNote.fontFamily}
                // As stored, not themed: the words sit on pale paper on
                // either board, as the note draws them.
                color={editingNote.strokeColor}
                textAlign={editingNote.textAlign}
                initialText={editingNote.text}
                onChange={setLiveText}
                onCommit={handleCommitText}
              />
            )}

            {/* Not for a shape that has not reached the board yet: a note
                just put down is opened in the same breath it is added. */}
            {textEditorScreenPosition &&
              !editingNote &&
              (!editingTextShapeId || editingTextShape) && (
                <TextEditor
                  key={textEditingKeyRef.current}
                  position={textEditorScreenPosition}
                  align={editingArrow || editingTopic ? 'center' : 'left'}
                  fontSize={textEditorFontSize}
                  fontFamily={textEditorFontFamily}
                  color={textEditorColor}
                  initialText={editingTextInitialValue}
                  onCommit={handleCommitText}
                  onCancel={handleCancelText}
                  onChange={setLiveText}
                  onEnter={editingTopic ? handleTopicEnter : undefined}
                  onTab={editingTopic ? handleTopicTab : undefined}
                  // A map is named as it is grown, and Escape is how the
                  // growing stops: it keeps the last name typed.
                  commitOnEscape={Boolean(editingTopic)}
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
              viewerRole={user?.role ?? null}
              managesWorkspace={managesBoardWorkspace}
              ownerName={overview?.ownerName ?? null}
              ownerId={overview?.ownerId ?? null}
              roster={roster}
            />

            <SignUpPrompt
              reason={signUpReason}
              signedIn={signedIn}
              theme={presenceTheme}
              onClose={hideSignUp}
            />

            <ConfirmDialog
              open={pendingReplace !== null}
              title={t('replace.title')}
              confirmLabel={t('replace.confirm')}
              destructive
              icon={<FileInput aria-hidden="true" />}
              theme={presenceTheme}
              onConfirm={confirmReplace}
              onClose={cancelReplace}
            >
              {rich(t('replace.body', { count: replaceShapeCount.current }), {
                file: <strong>{lastReplace.current?.fileName}</strong>,
                undo: <KeyCaps keys="mod+z" size="sm" />,
              })}
            </ConfirmDialog>

            <ExportImageDialog
              open={exportOpen}
              onClose={hideExport}
              shapes={shownShapes}
              selectedShapes={selectedShapes}
              boardName={boardTitle}
              darkTheme={resolvedTheme === 'dark'}
              theme={presenceTheme}
              images={boardPictures.cache}
              resolveImageDataUrls={boardPictures.resolveDataUrls}
            />

            {/* On the settings dialog's surface rather than the editor's
                chrome: it stops the board to ask a question, which is the one
                other thing in the app that is not framing the canvas. */}
            <ConfirmDialog
              open={resetOpen}
              title={t('reset.title')}
              confirmLabel={t('reset.confirm')}
              // Nothing to discard on an empty board, so nothing dressed as
              // discarding — but the row is still live, and it still
              // recentres the view.
              destructive={resetShapeCount.current > 0}
              icon={<RotateCcw aria-hidden="true" />}
              theme={presenceTheme}
              onConfirm={confirmReset}
              onClose={hideReset}
            >
              {resetShapeCount.current > 0
                ? rich(t('reset.body', { count: resetShapeCount.current }), {
                    undo: <KeyCaps keys="mod+z" size="sm" />,
                  })
                : t('reset.emptyBody')}
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
                  workspace={settingsWorkspace}
                  renameWorkspace={renameWorkspaceFromSettings}
                  showWorkspace={boardSwitcher.browseWorkspace}
                  openBoard={exportOpenBoard}
                  analytics={usage.consent}
                  chooseAnalytics={usage.choose}
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
            {/* Waits for the card above to be done with: it only asks an
                account whose address is confirmed. */}
            <AnalyticsNotice profile={account.profile} onAnswer={usage.choose} />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
