import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExitModeButton } from './ExitModeButton';

const noop = () => {};

const focus = () => renderToString(<ExitModeButton mode="focus" onExit={noop} />);
const view = () => renderToString(<ExitModeButton mode="view" onExit={noop} />);

describe('ExitModeButton smoke', () => {
  it('says the way out', () => {
    expect(focus()).toContain('Exit focus mode');
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
});
