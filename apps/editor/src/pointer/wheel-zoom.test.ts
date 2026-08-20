import { describe, expect, it } from 'vitest';
import { normalizeDelta, wheelZoomFactor } from './useWheelEvents';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

/** Mirrors applyZoom in tool-machine: the factor multiplies the current zoom. */
function applyZoom(zoom: number, factor: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
}

describe('wheelZoomFactor', () => {
  it('is always a positive ratio', () => {
    // The bug this replaces: `1 - deltaY * 0.01` hit exactly 0 at deltaY 100
    // and went negative beyond it, so `zoom * factor` collapsed to the minimum.
    for (const deltaY of [-1000, -240, -120, -100, -53, -4, 0, 4, 53, 100, 120, 240, 1000]) {
      expect(wheelZoomFactor(deltaY)).toBeGreaterThan(0);
    }
  });

  it('zooms out by a sane step for one mouse-wheel notch', () => {
    // A wheel notch is deltaY 100 in Chrome, 120 in Firefox on Windows.
    for (const notch of [53, 100, 120]) {
      const next = applyZoom(1, wheelZoomFactor(notch));
      expect(next).toBeLessThan(1);
      expect(next).toBeGreaterThan(0.7);
    }
  });

  it('does not slam to the minimum zoom on one notch', () => {
    // The reported symptom: scrolling out once jumped straight to 10%.
    expect(applyZoom(2, wheelZoomFactor(100))).toBeGreaterThan(1.5);
    expect(applyZoom(1, wheelZoomFactor(100))).not.toBeCloseTo(MIN_ZOOM);
  });

  it('is symmetric — a notch out then in returns to where it started', () => {
    const start = 1.5;
    const out = applyZoom(start, wheelZoomFactor(100));
    expect(applyZoom(out, wheelZoomFactor(-100))).toBeCloseTo(start, 6);
  });

  it('zooms in for negative deltaY', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
  });

  it('is a no-op at zero', () => {
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it('stays gentle for trackpad-sized deltas', () => {
    // Pinch gestures fire many small events; each must be a small step or the
    // gesture overshoots wildly.
    expect(wheelZoomFactor(4)).toBeGreaterThan(0.99);
    expect(wheelZoomFactor(4)).toBeLessThan(1);
  });

  it('clamps a single enormous delta', () => {
    // Some mice report huge deltas on fast flicks; one event should not cross
    // the whole zoom range.
    const huge = wheelZoomFactor(100_000);
    expect(huge).toBe(wheelZoomFactor(200));
    expect(applyZoom(1, huge)).toBeGreaterThan(MIN_ZOOM);
  });
});

describe('normalizeDelta', () => {
  it('passes pixel deltas through', () => {
    expect(normalizeDelta(100, 0)).toBe(100);
  });

  it('scales line deltas', () => {
    // Firefox on Windows reports lines: deltaY 3 means three lines, not three
    // pixels, so treating it as pixels makes zooming feel dead.
    expect(normalizeDelta(3, 1)).toBe(48);
  });

  it('scales page deltas', () => {
    expect(normalizeDelta(1, 2)).toBe(800);
  });

  it('makes a line-mode notch behave like a pixel-mode one', () => {
    const line = applyZoom(1, wheelZoomFactor(3, 1));
    const pixel = applyZoom(1, wheelZoomFactor(48, 0));
    expect(line).toBeCloseTo(pixel, 6);
  });
});
