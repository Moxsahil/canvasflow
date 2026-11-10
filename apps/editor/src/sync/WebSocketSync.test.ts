import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const providers: Array<{
  config: Record<string, unknown>;
  connect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}> = [];

vi.mock('@hocuspocus/provider', () => ({
  WebSocketStatus: {
    Connecting: 'connecting',
    Connected: 'connected',
    Disconnected: 'disconnected',
  },
  HocuspocusProvider: vi.fn().mockImplementation((config: Record<string, unknown>) => {
    const provider = { config, connect: vi.fn(), destroy: vi.fn(), awareness: null };
    providers.push(provider);
    return provider;
  }),
}));

const { WebSocketSync } = await import('./WebSocketSync');
const { RECONNECT_POLICY } = await import('./reconnect-policy');

/** Just enough of a browser for the listeners WebSocketSync installs. */
function fakeBrowser() {
  const windowTarget = new EventTarget();
  const documentTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', windowTarget);
  vi.stubGlobal('document', documentTarget);
  return { window: windowTarget };
}

function open() {
  const doc = { yDoc: {} } as never;
  return new WebSocketSync(doc, {
    boardId: 'board-1',
    syncUrl: 'ws://127.0.0.1:4000',
    apiUrl: 'http://127.0.0.1:3001',
    getToken: () => 'token',
  });
}

describe('WebSocketSync reconnecting', () => {
  beforeEach(() => {
    providers.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands the capped, jittered backoff to the socket the provider makes', () => {
    fakeBrowser();
    open();
    expect(providers).toHaveLength(1);
    // With a url and no websocketProvider, the provider makes the socket from
    // this same configuration and owns it.
    expect(providers[0]!.config).toMatchObject({ url: 'ws://127.0.0.1:4000', ...RECONNECT_POLICY });
    expect(providers[0]!.config.websocketProvider).toBeUndefined();
    expect(RECONNECT_POLICY.maxDelay).toBeLessThanOrEqual(10_000);
    expect(RECONNECT_POLICY.jitter).toBe(true);
    expect(RECONNECT_POLICY.maxAttempts).toBe(0);
  });

  it('retries at once when the network comes back', () => {
    const browser = fakeBrowser();
    open();
    browser.window.dispatchEvent(new Event('online'));
    expect(providers[0]!.connect).toHaveBeenCalledTimes(1);
  });

  it('stops listening when disposed', () => {
    const browser = fakeBrowser();
    const sync = open();
    sync.dispose();
    expect(providers[0]!.destroy).toHaveBeenCalledTimes(1);
    browser.window.dispatchEvent(new Event('online'));
    expect(providers[0]!.connect).not.toHaveBeenCalled();
  });
});
