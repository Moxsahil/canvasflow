import { describe, expect, it } from 'vitest';
import { createDoublePressTracker, type PressSample } from './usePointerEvents';

function sample(over: Partial<PressSample> = {}): PressSample {
  return {
    pointerId: 1,
    button: 0,
    clientX: 100,
    clientY: 100,
    pointerType: 'mouse',
    timeStamp: 0,
    ...over,
  };
}

type Tracker = ReturnType<typeof createDoublePressTracker>;

interface TapOptions {
  x?: number;
  y?: number;
  time?: number;
  pointerType?: string;
  pointerId?: number;
  button?: number;
}

/** Press and lift in one place. Answers whether that lift completed a double. */
function tap(tracker: Tracker, options: TapOptions = {}): boolean {
  const { x = 100, y = 100, time = 0, pointerType = 'mouse', pointerId = 1, button = 0 } = options;
  const event = sample({ clientX: x, clientY: y, timeStamp: time, pointerType, pointerId, button });
  tracker.down(event);
  return tracker.up(event);
}

describe('createDoublePressTracker', () => {
  it('pairs two quick presses in the same place', () => {
    const tracker = createDoublePressTracker();
    expect(tap(tracker, { time: 0 })).toBe(false);
    expect(tap(tracker, { time: 120 })).toBe(true);
  });

  it('leaves a single press alone', () => {
    expect(tap(createDoublePressTracker())).toBe(false);
  });

  it('will not pair a press that arrives too late', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { time: 0 });
    expect(tap(tracker, { time: 600 })).toBe(false);
  });

  it('will not pair a press that lands too far away', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { x: 100, y: 100, time: 0 });
    expect(tap(tracker, { x: 200, y: 100, time: 120 })).toBe(false);
  });

  it('takes a small drift between the two presses', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { x: 100, y: 100, time: 0 });
    expect(tap(tracker, { x: 108, y: 105, time: 120 })).toBe(true);
  });

  it('spends the pair, so a third press does not fire off the second', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { time: 0 });
    expect(tap(tracker, { time: 100 })).toBe(true);
    expect(tap(tracker, { time: 200 })).toBe(false);
    // ...but the third opens a pair of its own.
    expect(tap(tracker, { time: 300 })).toBe(true);
  });

  it('does not count a drag as half of a double', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { time: 0 });

    tracker.down(sample({ timeStamp: 100 }));
    tracker.move(sample({ clientX: 160, clientY: 100, timeStamp: 110 }));
    expect(tracker.up(sample({ clientX: 160, clientY: 100, timeStamp: 120 }))).toBe(false);

    // The drag ended the pair the first press had opened, so the press after it
    // starts over rather than completing one.
    expect(tap(tracker, { time: 200 })).toBe(false);
  });

  it('allows a finger more wobble than a mouse before calling it a drag', () => {
    const wobble = (pointerType: string) => {
      const tracker = createDoublePressTracker();
      tap(tracker, { time: 0, pointerType });
      tracker.down(sample({ timeStamp: 100, pointerType }));
      tracker.move(sample({ clientX: 107, clientY: 100, timeStamp: 110, pointerType }));
      return tracker.up(sample({ clientX: 107, clientY: 100, timeStamp: 120, pointerType }));
    };

    expect(wobble('touch')).toBe(true);
    expect(wobble('mouse')).toBe(false);
  });

  it('will not pair presses from different kinds of pointer', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { time: 0, pointerType: 'touch' });
    expect(tap(tracker, { time: 100, pointerType: 'mouse' })).toBe(false);
  });

  it('ignores presses that are not the primary button', () => {
    const tracker = createDoublePressTracker();
    expect(tap(tracker, { time: 0, button: 1 })).toBe(false);
    expect(tap(tracker, { time: 100, button: 1 })).toBe(false);
  });

  it('treats a second finger as a pinch rather than a tap', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { time: 0, pointerType: 'touch' });

    // Two fingers down and up again, in the same spot and inside the window.
    tracker.down(sample({ pointerId: 1, timeStamp: 100, pointerType: 'touch' }));
    tracker.down(sample({ pointerId: 2, timeStamp: 110, pointerType: 'touch' }));
    expect(tracker.up(sample({ pointerId: 2, timeStamp: 150, pointerType: 'touch' }))).toBe(false);
    expect(tracker.up(sample({ pointerId: 1, timeStamp: 160, pointerType: 'touch' }))).toBe(false);

    // And it left nothing behind for the next tap to pair with.
    expect(tap(tracker, { time: 200, pointerType: 'touch' })).toBe(false);
  });

  it('forgets everything when the system takes the gesture away', () => {
    const tracker = createDoublePressTracker();
    tap(tracker, { time: 0 });

    tracker.down(sample({ timeStamp: 100 }));
    tracker.cancel(sample({ timeStamp: 110 }));

    expect(tap(tracker, { time: 200 })).toBe(false);
  });
});
