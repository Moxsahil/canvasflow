import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocketSyncConfig } from './WebSocketSync';

/**
 * How the editor reacts to what the sync connection reports: its status, the
 * server's refusals, and the messages the server sends outside the document.
 * The provider is replaced with a recorder, so each test plays the server's
 * side by calling the callbacks the editor handed it.
 */

interface FakeAwareness {
  clientID: number;
  meta: Map<number, { lastUpdated: number }>;
  getLocalState: ReturnType<typeof vi.fn>;
  setLocalState: ReturnType<typeof vi.fn>;
}

interface FakeProvider {
  config: Record<string, (...args: never[]) => unknown> & Record<string, unknown>;
  connect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  awareness: FakeAwareness | null;
}

const providers: FakeProvider[] = [];

vi.mock('@hocuspocus/provider', () => ({
  WebSocketStatus: {
    Connecting: 'connecting',
    Connected: 'connected',
    Disconnected: 'disconnected',
  },
  HocuspocusProvider: vi.fn().mockImplementation((config: FakeProvider['config']) => {
    const provider: FakeProvider = { config, connect: vi.fn(), destroy: vi.fn(), awareness: null };
    providers.push(provider);
    return provider;
  }),
}));

const { WebSocketSync } = await import('./WebSocketSync');

function open(overrides: Partial<WebSocketSyncConfig> = {}) {
  const config = {
    boardId: 'board-1',
    syncUrl: 'ws://127.0.0.1:4000',
    apiUrl: 'http://127.0.0.1:3001',
    getToken: () => 'token',
    onStatusChange: vi.fn(),
    onSynced: vi.fn(),
    onError: vi.fn(),
    onAuthError: vi.fn(),
    onAccessChanged: vi.fn(),
    onAccessRevoked: vi.fn(),
    onSessionEnded: vi.fn(),
    onWorkspaceChanged: vi.fn(),
    onAccountChanged: vi.fn(),
    ...overrides,
  } satisfies WebSocketSyncConfig;
  const sync = new WebSocketSync({ yDoc: {} } as never, config);
  const provider = providers.at(-1)!;
  const call = (name: string, arg: unknown) =>
    (provider.config[name] as (value: unknown) => void)(arg);
  return { sync, config, provider, call };
}

const stateless = (message: unknown) => ({
  payload: typeof message === 'string' ? message : JSON.stringify(message),
});

beforeEach(() => {
  providers.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the connection status', () => {
  it('reads connecting, then connected', () => {
    const { config, call } = open();
    expect(config.onStatusChange).toHaveBeenLastCalledWith('connecting');
    call('onStatus', { status: 'connected' });
    expect(config.onStatusChange).toHaveBeenLastCalledWith('connected');
  });

  it('says reconnecting for a few drops, then offline, and resets once back', () => {
    const { config, call } = open();
    for (let drop = 1; drop <= 4; drop++) {
      call('onStatus', { status: 'disconnected' });
      expect(config.onStatusChange).toHaveBeenLastCalledWith('reconnecting');
    }
    call('onStatus', { status: 'disconnected' });
    expect(config.onStatusChange).toHaveBeenLastCalledWith('offline');

    call('onStatus', { status: 'connected' });
    call('onStatus', { status: 'disconnected' });
    expect(config.onStatusChange).toHaveBeenLastCalledWith('reconnecting');
  });

  it('reports an unknown status as an error', () => {
    const { config, call } = open();
    call('onStatus', { status: 'something-else' });
    expect(config.onStatusChange).toHaveBeenLastCalledWith('error');
  });

  it('reports the first full sync, and nothing once disposed', () => {
    const { sync, config, call } = open();
    call('onSynced', { state: false });
    expect(config.onSynced).not.toHaveBeenCalled();
    call('onSynced', { state: true });
    expect(config.onSynced).toHaveBeenCalledTimes(1);

    sync.dispose();
    call('onSynced', { state: true });
    call('onStatus', { status: 'connected' });
    expect(config.onSynced).toHaveBeenCalledTimes(1);
    expect(config.onStatusChange).not.toHaveBeenLastCalledWith('connected');
  });

  it('sends the current token each time it connects', () => {
    let token: string | null = 'first';
    const { provider } = open({ getToken: () => token });
    const read = provider.config.token as () => string;
    expect(read()).toBe('first');
    token = 'second';
    expect(read()).toBe('second');
    token = null;
    expect(read()).toBe('');
  });
});

describe('a refused connection', () => {
  it('asks for a new token when the server just does not accept this one', () => {
    const { config, provider, call } = open();
    call('onAuthenticationFailed', { reason: 'permission-denied' });
    expect(config.onAuthError).toHaveBeenCalledTimes(1);
    expect(config.onError).toHaveBeenCalledTimes(1);
    expect(provider.destroy).not.toHaveBeenCalled();
  });

  it('stops for good when access to the board was taken away', () => {
    const { config, provider, call } = open();
    call('onAuthenticationFailed', { reason: 'access-revoked' });
    expect(config.onAccessRevoked).toHaveBeenCalledTimes(1);
    expect(config.onStatusChange).toHaveBeenLastCalledWith('error');
    expect(config.onAuthError).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(provider.destroy).toHaveBeenCalledTimes(1);

    // Whatever arrives afterwards changes nothing.
    call('onStatus', { status: 'connected' });
    call('onAuthenticationFailed', { reason: 'access-revoked' });
    expect(config.onAccessRevoked).toHaveBeenCalledTimes(1);
  });

  it('stops for good when the session behind it ended', () => {
    const { config, provider, call } = open();
    call('onAuthenticationFailed', { reason: 'session-ended' });
    expect(config.onSessionEnded).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(provider.destroy).toHaveBeenCalledTimes(1);
  });
});

describe('messages from the server', () => {
  it('passes on a change of access, of workspace and of account', () => {
    const { config, call } = open();
    call('onStateless', stateless({ type: 'access-changed' }));
    expect(config.onAccessChanged).toHaveBeenCalledTimes(1);

    call('onStateless', stateless({ type: 'workspace-changed', workspaceId: 'ws-1' }));
    expect(config.onWorkspaceChanged).toHaveBeenCalledWith('ws-1');

    call('onStateless', stateless({ type: 'account-changed', part: 'notifications' }));
    expect(config.onAccountChanged).toHaveBeenCalledWith('notifications');
  });

  it('ignores messages that are malformed or name nothing it knows', () => {
    const { config, call } = open();
    call('onStateless', stateless('not json'));
    call('onStateless', stateless({ type: 'workspace-changed', workspaceId: 42 }));
    call('onStateless', stateless({ type: 'account-changed', part: 'billing' }));
    call('onStateless', stateless({ type: 'nothing-like-this' }));
    expect(config.onWorkspaceChanged).not.toHaveBeenCalled();
    expect(config.onAccountChanged).not.toHaveBeenCalled();
    expect(config.onError).not.toHaveBeenCalled();
  });

  it('stops when told mid-session that access was revoked or the session ended', () => {
    const revoked = open();
    revoked.call('onStateless', stateless({ type: 'access-revoked' }));
    expect(revoked.config.onAccessRevoked).toHaveBeenCalledTimes(1);

    const ended = open();
    ended.call('onStateless', stateless({ type: 'session-ended' }));
    expect(ended.config.onSessionEnded).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(revoked.provider.destroy).toHaveBeenCalledTimes(1);
    expect(ended.provider.destroy).toHaveBeenCalledTimes(1);
  });

  it('renews presence when asked, unless it was renewed a moment ago', () => {
    const { provider, call } = open();
    const state = { cursor: { x: 1, y: 2 } };
    provider.awareness = {
      clientID: 7,
      meta: new Map([[7, { lastUpdated: Date.now() }]]),
      getLocalState: vi.fn(() => state),
      setLocalState: vi.fn(),
    };

    call('onStateless', stateless({ type: 'presence-renew' }));
    expect(provider.awareness.setLocalState).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    call('onStateless', stateless({ type: 'presence-renew' }));
    expect(provider.awareness.setLocalState).toHaveBeenCalledWith(state);
  });

  it('has no presence to renew before anyone has set one', () => {
    const { provider, call } = open();
    provider.awareness = {
      clientID: 7,
      meta: new Map(),
      getLocalState: vi.fn(() => null),
      setLocalState: vi.fn(),
    };
    call('onStateless', stateless({ type: 'presence-renew' }));
    expect(provider.awareness.setLocalState).not.toHaveBeenCalled();
  });
});

describe('coming back after a quiet spell', () => {
  it('wakes the API and the socket after half a minute idle, not before', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('ok')));
    vi.stubGlobal('fetch', fetchMock);
    const { sync, provider } = open();

    vi.advanceTimersByTime(5_000);
    sync.notifyActivity();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(provider.connect).not.toHaveBeenCalled();

    vi.advanceTimersByTime(31_000);
    sync.notifyActivity();
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3001/health', { method: 'GET' });
    expect(provider.connect).toHaveBeenCalledTimes(1);
  });

  it('does nothing once disposed', () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('ok')));
    vi.stubGlobal('fetch', fetchMock);
    const { sync } = open();
    sync.dispose();
    vi.advanceTimersByTime(60_000);
    sync.notifyActivity();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
