import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExitModeButton } from './ExitModeButton';

const noop = () => {};

const focus = () => renderToString(<ExitModeButton mode="focus" onExit={noop} />);
const view = () => renderToString(<ExitModeButton mode="view" onExit={noop} />);

describe('ExitModeButton smoke', () => {
  it('names the mode at rest and the way out under the sweep', () => {
    // Both layers are in the markup; hover only decides which one is seen.
    expect(focus()).toContain('Focus mode');
    expect(focus()).toContain('Exit focus mode');
    expect(view()).toContain('View mode');
    expect(view()).toContain('Exit view mode');
  });

  it('says where it leads, for the pointer and the screen reader alike', () => {
    expect(focus()).toContain('title="Exit focus mode');
    expect(focus()).toContain('aria-label="Exit focus mode');
    expect(view()).toContain('title="Exit view mode');
    expect(view()).toContain('aria-label="Exit view mode');
  });

  it('carries the icon the command palette lists each mode under', () => {
    expect(view()).toContain('lucide-eye');
    expect(focus()).toContain('lucide-maximize');
  });

  it('sweeps in a colour of its own, and a different one per mode', () => {
    // Blue is the share button's, which stands in this same spot the rest of
    // the time; green is that button when the board is live.
    const colour = (html: string) => /--color-primary:(#[0-9a-f]{6})/.exec(html)?.[1];
    expect(colour(focus())).toBeDefined();
    expect(colour(view())).toBeDefined();
    expect(colour(focus())).not.toBe(colour(view()));
    for (const html of [focus(), view()]) {
      expect(html).not.toContain('--color-primary:#0f9d58');
    }
  });

  it('keeps the sweep but not the speck it grows from', () => {
    // The pill's resting mark carries the share button's live colour; here
    // there is no such state, so it stays invisible until the sweep starts.
    for (const html of [focus(), view()]) {
      expect(html).toContain('opacity-0 group-hover:opacity-100');
    }
  });

  it('is built like the share button, and positions itself no differently', () => {
    // It sits in the top-right dock, which owns placement for its children.
    expect(focus()).toContain('group-hover:');
    expect(focus()).not.toContain('absolute top-4');
  });
});
