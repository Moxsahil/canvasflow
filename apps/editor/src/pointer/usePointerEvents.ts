import { useEffect, useRef, type RefObject } from 'react';
import type { Point } from '../machine/tool-machine.types';

/**
 * Ctrl, or Cmd on a Mac — the key that reverses whatever the snapping
 * preference says for the length of one gesture.
 *
 * Reported on both press and move because either can be the moment it matters:
 * the key decides where a shape starts as well as where it lands, and it can be
 * taken up or let go halfway through a drag.
 */
const snapOverrideHeld = (event: PointerEvent) => event.ctrlKey || event.metaKey;

/**
 * What makes two presses one gesture: how soon the second has to arrive, and
 * how near the first it has to land. Milliseconds and screen pixels, so the
 * tolerance stays the same gesture however far the board is zoomed in.
 *
 * Recognised here rather than left to the browser's `dblclick`, which a mouse
 * and a trackpad send but a finger never does. One recogniser over the pointer
 * stream — which every device already goes through — covers all three, and
 * leaves no way for a native event and a separate touch handler to both fire on
 * a machine that has a screen as well as a mouse.
 */
const DOUBLE_PRESS_MS = 450;
const DOUBLE_PRESS_SLOP = 40;

/**
 * How far the pointer may travel while held for the press to still count as a
 * tap rather than the opening of a drag. A finger lands wide and rolls as it
 * lifts where a mouse sits still, so it is given more room.
 */
const tapDragSlopFor = (pointerType: string) => (pointerType === 'touch' ? 10 : 4);

/**
 * How near an open text field a pencil has to land, in screen pixels, for what
 * it does next to be the field's business rather than the board's.
 *
 * On an iPad the system turns writing near a focused field into typing. The
 * stroke doesn't have to start inside the field, which is often smaller than
 * the letters going into it, so the board has to keep its hands off strokes
 * that start around it too.
 */
const HANDWRITING_REACH = 120;

/** Whether a field that takes typing has focus, within reach of this point. */
function focusedFieldNear(x: number, y: number): boolean {
  const field = document.activeElement;
  const typesText =
    field instanceof HTMLTextAreaElement ||
    (field instanceof HTMLInputElement &&
      ['text', 'search', 'url', 'email'].includes(field.type)) ||
    (field instanceof HTMLElement && field.isContentEditable);
  if (!typesText) return false;
  const box = field.getBoundingClientRect();
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy) <= HANDWRITING_REACH;
}

/**
 * A pen pressed onto the screen itself — an Apple Pencil, a Surface Pen —
 * rather than a tablet on the desk, whose pen drives a cursor like a mouse and
 * has no hand resting on the screen to keep out.
 */
const isDirectDisplayPen = (e: PointerEvent) =>
  e.pointerType === 'pen' &&
  (navigator.maxTouchPoints > 0 || window.matchMedia?.('(any-pointer: coarse)').matches);

/** The parts of a pointer event the double-press recogniser reads. */
export interface PressSample {
  pointerId: number;
  button: number;
  clientX: number;
  clientY: number;
  pointerType: string;
  timeStamp: number;
}

/**
 * Watches the pointer stream for two presses that belong together.
 *
 * Kept apart from the hook, and exported, so the rules above can be driven
 * press by press in a test rather than only through a real canvas.
 *
 * Feed it every press, move and lift; `up` answers whether that lift completed
 * a double. Only the primary button counts, only while a single pointer is
 * down, and only if neither press wandered far enough to be a drag.
 */
export function createDoublePressTracker() {
  const pointersDown = new Set<number>();
  /** The press in progress, while it could still turn out to be a tap. */
  let press: { x: number; y: number; pointerType: string } | null = null;
  /** The last press that did, waiting to be paired with the next one. */
  let previous: { x: number; y: number; time: number; pointerType: string } | null = null;

  const forget = () => {
    press = null;
    previous = null;
  };

  return {
    down(e: PressSample): void {
      pointersDown.add(e.pointerId);
      const isOnlyPointer = pointersDown.size === 1;
      // A second finger means a pinch or a two-finger scroll. Neither is a tap,
      // and neither should leave a half-finished one behind it.
      if (!isOnlyPointer) previous = null;
      press =
        isOnlyPointer && e.button === 0
          ? { x: e.clientX, y: e.clientY, pointerType: e.pointerType }
          : null;
    },

    move(e: PressSample): void {
      // Travel past the slop makes this press a drag, which is neither half of
      // a double — and ends whatever pair the press before it had started.
      if (
        press &&
        Math.hypot(e.clientX - press.x, e.clientY - press.y) > tapDragSlopFor(press.pointerType)
      ) {
        forget();
      }
    },

    /** Whether this lift is the second half of a double press. */
    up(e: PressSample): boolean {
      pointersDown.delete(e.pointerId);
      const lifted = press;
      press = null;
      // Another pointer still down means this lift is part of a multi-touch
      // gesture, whatever it looked like on its own.
      if (!lifted || pointersDown.size > 0) {
        previous = null;
        return false;
      }

      if (
        previous &&
        previous.pointerType === lifted.pointerType &&
        e.timeStamp - previous.time <= DOUBLE_PRESS_MS &&
        Math.hypot(e.clientX - previous.x, e.clientY - previous.y) <= DOUBLE_PRESS_SLOP
      ) {
        // Spent, so a third press in the same spot opens a new pair instead of
        // firing again off the back of the first.
        previous = null;
        return true;
      }

      previous = {
        x: e.clientX,
        y: e.clientY,
        time: e.timeStamp,
        pointerType: lifted.pointerType,
      };
      return false;
    },

    /**
     * The system taking the gesture away — a palm rejected, a browser gesture
     * winning. None of it was a tap.
     */
    cancel(e: PressSample): void {
      pointersDown.delete(e.pointerId);
      forget();
    },
  };
}

interface UsePointerEventsOptions {
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
  /**
   * A press of the secondary button, the one that opens the context menu.
   *
   * Reported on the press rather than with the menu, so the selection is
   * settled before the menu reads it. The browser's `contextmenu` comes after
   * this on every platform: straight after on some, only once the button is
   * released on others. The press starts no gesture of its own.
   */
  onContextPress?: (point: Point, screenPoint: Point) => void;
  /**
   * Two presses in the same place in quick succession, from a mouse, a
   * trackpad, a pen or a finger alike — see `DOUBLE_PRESS_MS`. Reported after
   * the second press has been delivered in full, so the board has finished
   * answering it before anything is opened on top.
   */
  onDoubleClick: (point: Point, screenPoint: Point) => void;
  /**
   * Every pointer position over the canvas, pressed or not — and `null` once
   * the pointer leaves.
   *
   * Separate from `onPointerMove`, which fires only while a button is held
   * because that is what drag and resize need. Collaboration needs the other
   * kind: a cursor is worth showing long before anyone clicks anything.
   */
  onPointerHover?: (point: Point | null) => void;
  /**
   * Leave touches out: a finger or the side of a hand on the board does
   * nothing at all, and only a pen, a mouse or a trackpad reaches it.
   */
  penMode?: boolean;
  /** A pen pressed onto the screen itself, the cue to put pen mode on. */
  onPenDetected?: () => void;
  screenToWorld: (screenX: number, screenY: number) => Point;
  eventToCanvasScreen: (event: PointerEvent) => Point;
}

export function usePointerEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onContextPress,
    onDoubleClick,
    onPointerHover,
    penMode = false,
    onPenDetected,
    screenToWorld,
    eventToCanvasScreen,
  }: UsePointerEventsOptions,
): void {
  const lastScreenRef = useRef<Point | null>(null);
  /**
   * The one pointer the board is following, from its press to its lift.
   *
   * One at a time: a second finger, or a palm landing beside a pencil, would
   * otherwise feed its own positions into the stroke under way and end it by
   * lifting. The latest event is kept so a gesture can be finished early, at
   * the last place it was seen.
   */
  const followedRef = useRef<{ pointerId: number; pointerType: string; last: PointerEvent } | null>(
    null,
  );
  const capturedPointerIdRef = useRef<number | null>(null);
  /**
   * Pointers the board is ignoring until they lift: touches in pen mode, and a
   * touch a pencil took over from.
   */
  const ignoredRef = useRef(new Set<number>());
  /**
   * A pencil press near an open text field, held back from the board until it
   * shows what it is. If it travels it was writing, which the field takes as
   * typing, and the board never hears of it: answered as a press, it would
   * close the field or open a marquee under the words. If it lifts where it
   * landed it was a tap, and the board gets it then.
   */
  const heldPenRef = useRef<{ press: PointerEvent; travelled: boolean } | null>(null);
  // One recogniser for the life of the hook: it carries the press before last,
  // which is the whole point of it.
  const doublePressRef = useRef<ReturnType<typeof createDoublePressTracker> | null>(null);
  doublePressRef.current ??= createDoublePressTracker();
  const doublePress = doublePressRef.current;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ignored = ignoredRef.current;

    /** Hand a press to the board, now it is known to be the board's. */
    const beginPress = (e: PointerEvent, capture: boolean) => {
      // A press held on the chrome can leave a text selection behind it, and
      // Safari keeps its copy and paste bubble up for as long as one exists.
      const selection = document.getSelection();
      if (selection?.anchorNode) selection.removeAllRanges();
      followedRef.current = { pointerId: e.pointerId, pointerType: e.pointerType, last: e };
      if (capture) {
        capturedPointerIdRef.current = e.pointerId;
        canvas.setPointerCapture(e.pointerId);
      }

      doublePress.down(e);

      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      lastScreenRef.current = screen;
      onPointerDown(world, screen, e.button, e.shiftKey, snapOverrideHeld(e));
    };

    /** End the followed gesture where this event puts it. */
    const finishPress = (e: PointerEvent) => {
      followedRef.current = null;
      const captured = capturedPointerIdRef.current;
      if (captured !== null) {
        if (canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
        capturedPointerIdRef.current = null;
      }
      lastScreenRef.current = null;
      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      onPointerUp(world, screen);
      return { world, screen };
    };

    const handlePointerDown = (e: PointerEvent) => {
      // A new pencil press means the one held before it has gone, whether or
      // not its lift came back here.
      if (e.pointerType === 'pen') heldPenRef.current = null;
      // Not default-prevented, unlike the other two: the browser moving focus
      // off an open text field is what a right-click away from it should do.
      if (e.button === 2) {
        onContextPress?.(screenToWorld(e.clientX, e.clientY), eventToCanvasScreen(e));
        return;
      }
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault();

      if (penMode && e.pointerType === 'touch') {
        // Captured, so its lift comes back here to be forgotten wherever the
        // hand has drifted to by then.
        ignored.add(e.pointerId);
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (isDirectDisplayPen(e)) onPenDetected?.();

      const followed = followedRef.current;
      if (followed) {
        if (e.pointerType !== 'pen' || followed.pointerType !== 'touch') {
          // Seen, so a second finger still keeps two from passing for a double
          // tap, but the board stays with the pointer it has.
          doublePress.down(e);
          return;
        }
        // A pencil coming down on a touch gesture: the hand got there first,
        // as it does when someone settles in to write. The pencil is what they
        // meant, so the touch ends where it is and is ignored from here on.
        doublePress.cancel(followed.last);
        ignored.add(followed.pointerId);
        finishPress(followed.last);
      }

      if (e.pointerType === 'pen' && e.button === 0 && focusedFieldNear(e.clientX, e.clientY)) {
        heldPenRef.current = { press: e, travelled: false };
        // Captured all the same, so the lift comes back here wherever it lands.
        canvas.setPointerCapture(e.pointerId);
        return;
      }
      beginPress(e, true);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (ignored.has(e.pointerId)) return;
      const world = screenToWorld(e.clientX, e.clientY);
      // Before the pressed-only guard: hover is reported whether or not a
      // button is down, so a collaborator's cursor doesn't freeze mid-drag.
      onPointerHover?.(world);

      const held = heldPenRef.current;
      if (held?.press.pointerId === e.pointerId) {
        const { clientX, clientY } = held.press;
        if (Math.hypot(e.clientX - clientX, e.clientY - clientY) > tapDragSlopFor('pen')) {
          held.travelled = true;
        }
        return;
      }

      const followed = followedRef.current;
      if (!followed) return;

      doublePress.move(e);
      if (e.pointerId !== followed.pointerId) return;
      followed.last = e;

      const screen = eventToCanvasScreen(e);
      const last = lastScreenRef.current ?? screen;
      const delta = { x: screen.x - last.x, y: screen.y - last.y };
      lastScreenRef.current = screen;
      onPointerMove(world, screen, delta, e.altKey, snapOverrideHeld(e));
    };

    const handlePointerLeave = (e: PointerEvent) => {
      // A hand coming off the board in pen mode was never its pointer.
      if (penMode && e.pointerType === 'touch') return;
      onPointerHover?.(null);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (ignored.delete(e.pointerId)) return;

      const held = heldPenRef.current;
      if (held?.press.pointerId === e.pointerId) {
        heldPenRef.current = null;
        if (held.travelled) {
          // Writing, and the field's. Nor is it half of a double tap.
          doublePress.cancel(e);
          return;
        }
        // A tap, delivered as the press it always was. Its lift follows below.
        beginPress(held.press, false);
      }

      // Asked before the early return, so the recogniser sees every lift even
      // when the board has nothing to do with this one.
      const completesDoublePress = doublePress.up(e);
      if (followedRef.current?.pointerId !== e.pointerId) return;
      const { world, screen } = finishPress(e);

      // Last, on purpose: the second press of a double is an ordinary press as
      // well, and the board should have finished answering it before anything
      // is opened on top.
      if (completesDoublePress) onDoubleClick(world, screen);
    };

    const handlePointerCancel = (e: PointerEvent) => {
      if (ignored.delete(e.pointerId)) return;
      // The system taking a held pencil away is the system writing with it.
      if (heldPenRef.current?.press.pointerId === e.pointerId) {
        heldPenRef.current = null;
        return;
      }
      doublePress.cancel(e);
      handlePointerUp(e);
    };

    /**
     * Safari on an iPad reads a pencil or a finger on the canvas as the start
     * of its own gestures too: handwriting turned into text, the magnifier,
     * the copy and paste bubble on a press and hold. Cancelling the pointer
     * event doesn't call those off; only the touch event beneath it can, and
     * only from a listener that isn't passive. The board reads nothing but
     * pointer events, so it loses nothing by it.
     */
    const handleTouchStart = (e: TouchEvent) => e.preventDefault();

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointerleave', handlePointerLeave);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [
    canvasRef,
    doublePress,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onContextPress,
    onDoubleClick,
    onPointerHover,
    penMode,
    onPenDetected,
    screenToWorld,
    eventToCanvasScreen,
  ]);
}
