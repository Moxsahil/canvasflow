import { afterEach, describe, expect, it, vi } from 'vitest';
import { wipeThemeChange } from './theme-transition';

/**
 * The browser parts a wipe needs: a document that can start a transition, and
 * a root element that can be animated. `ready` is handed back so a test can
 * decide when — or whether — the transition gets going.
 */
function stubBrowser({
  viewTransitions = true,
  reducedMotion = false,
}: { viewTransitions?: boolean; reducedMotion?: boolean } = {}) {
  const animate = vi.fn();
  let ready = Promise.resolve();

  const startViewTransition = vi.fn((callback: () => void) => {
    callback();
    return { ready };
  });

  vi.stubGlobal('document', {
    documentElement: { animate },
    ...(viewTransitions ? { startViewTransition } : {}),
  });
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({ matches: reducedMotion && query.includes('reduced-motion') }),
  });

  return {
    animate,
    startViewTransition,
    /** Makes the next transition one that gets skipped mid-wipe. */
    skipTransition: () => {
      ready = Promise.reject(new Error('skipped'));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wipeThemeChange', () => {
  it('wipes the new theme in from the left by default', async () => {
    const { animate } = stubBrowser();
    const apply = vi.fn();

    wipeThemeChange(apply);
    await vi.waitFor(() => expect(animate).toHaveBeenCalled());

    expect(apply).toHaveBeenCalledOnce();
    const [keyframes, options] = animate.mock.calls[0] as [
      { clipPath: string[] },
      { pseudoElement: string },
    ];
    // Clipped flat against the left edge, opening out to the whole window.
    expect(keyframes.clipPath[0]).toBe('inset(0 100% 0 0)');
    expect(keyframes.clipPath[1]).toBe('inset(0 0 0 0)');
    expect(options.pseudoElement).toBe('::view-transition-new(root)');
  });

  it('wipes from the right when asked', async () => {
    const { animate } = stubBrowser();

    wipeThemeChange(() => {}, 'right');
    await vi.waitFor(() => expect(animate).toHaveBeenCalled());

    const [keyframes] = animate.mock.calls[0] as [{ clipPath: string[] }];
    expect(keyframes.clipPath[0]).toBe('inset(0 0 0 100%)');
  });

  it('changes the theme without a transition where the browser has none', () => {
    const { animate } = stubBrowser({ viewTransitions: false });
    const apply = vi.fn();

    wipeThemeChange(apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(animate).not.toHaveBeenCalled();
  });

  it('changes the theme instantly for a reader who asked for less motion', () => {
    const { animate, startViewTransition } = stubBrowser({ reducedMotion: true });
    const apply = vi.fn();

    wipeThemeChange(apply);

    expect(apply).toHaveBeenCalledOnce();
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
  });

  it('still changes the theme when the transition is skipped mid-wipe', async () => {
    const { animate, skipTransition } = stubBrowser();
    skipTransition();
    const apply = vi.fn();

    // A second theme change arriving during a wipe skips the first, rejecting
    // its `ready`. The swap has happened either way; only the animation goes.
    expect(() => wipeThemeChange(apply)).not.toThrow();
    await Promise.resolve();

    expect(apply).toHaveBeenCalledOnce();
    expect(animate).not.toHaveBeenCalled();
  });
});
