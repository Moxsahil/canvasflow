import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, Toast } from './Toast';

// The toast measures where to stand in a layout effect, which a server render
// skips and warns about; the markup these tests read is complete without it.
const consoleError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((message: unknown, ...rest: unknown[]) => {
    if (typeof message === 'string' && message.includes('useLayoutEffect does nothing')) return;
    consoleError(message, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

describe('Toast', () => {
  it('says what happened in a live region that is there before anything is said', () => {
    const empty = renderToString(<Toast toast={null} />);
    expect(empty).toContain('role="status"');
    expect(empty).toContain('aria-live="polite"');
    expect(empty).not.toContain('data-testid="toast"');

    const shown = renderToString(<Toast toast={{ id: 1, text: 'Link copied to clipboard' }} />);
    expect(shown).toContain('data-testid="toast"');
    expect(shown).toContain('Link copied to clipboard');
  });

  it('takes no clicks, so it never stands between the pointer and the board', () => {
    expect(renderToString(<Toast toast={{ id: 1, text: 'x' }} />)).toContain('pointer-events-none');
  });

  it('stays up for three seconds', () => {
    expect(TOAST_DURATION_MS).toBe(3000);
  });
});
