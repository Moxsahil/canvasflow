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
  screenToWorld: (screenX: number, screenY: number) => Point;
  eventToCanvasScreen: (event: PointerEvent) => Point;
}

export function usePointerEvents(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onPointerHover,
    screenToWorld,
    eventToCanvasScreen,
  }: UsePointerEventsOptions,
): void {
  const lastScreenRef = useRef<Point | null>(null);
  const isDownRef = useRef(false);
  const capturedPointerIdRef = useRef<number | null>(null);
  // One recogniser for the life of the hook: it carries the press before last,
  // which is the whole point of it.
  const doublePressRef = useRef<ReturnType<typeof createDoublePressTracker> | null>(null);
  doublePressRef.current ??= createDoublePressTracker();
  const doublePress = doublePressRef.current;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      isDownRef.current = true;
      capturedPointerIdRef.current = e.pointerId;
      canvas.setPointerCapture(e.pointerId);

      doublePress.down(e);

      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      lastScreenRef.current = screen;
      onPointerDown(world, screen, e.button, e.shiftKey, snapOverrideHeld(e));
    };

    const handlePointerMove = (e: PointerEvent) => {
      const world = screenToWorld(e.clientX, e.clientY);
      // Before the pressed-only guard: hover is reported whether or not a
      // button is down, so a collaborator's cursor doesn't freeze mid-drag.
      onPointerHover?.(world);

      if (!isDownRef.current) return;

      doublePress.move(e);

      const screen = eventToCanvasScreen(e);
      const last = lastScreenRef.current ?? screen;
      const delta = { x: screen.x - last.x, y: screen.y - last.y };
      lastScreenRef.current = screen;
      onPointerMove(world, screen, delta, e.altKey, snapOverrideHeld(e));
    };

    const handlePointerLeave = () => onPointerHover?.(null);

    const handlePointerUp = (e: PointerEvent) => {
      // Asked before the early return, so the recogniser sees every lift even
      // when the board has nothing to do with this one.
      const completesDoublePress = doublePress.up(e);
      if (!isDownRef.current) return;
      isDownRef.current = false;
      if (capturedPointerIdRef.current !== null) {
        canvas.releasePointerCapture(capturedPointerIdRef.current);
        capturedPointerIdRef.current = null;
      }
      lastScreenRef.current = null;
      const screen = eventToCanvasScreen(e);
      const world = screenToWorld(e.clientX, e.clientY);
      onPointerUp(world, screen);

      // Last, on purpose: the second press of a double is an ordinary press as
      // well, and the board should have finished answering it before anything
      // is opened on top.
      if (completesDoublePress) onDoubleClick(world, screen);
    };

    const handlePointerCancel = (e: PointerEvent) => {
      doublePress.cancel(e);
      handlePointerUp(e);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
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
    onDoubleClick,
    onPointerHover,
    screenToWorld,
    eventToCanvasScreen,
  ]);
}
