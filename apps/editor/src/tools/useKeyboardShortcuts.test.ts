import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

vi.mock('react', () => ({
  useEffect: (effect: () => void) => effect(),
}));

function handlers() {
  return {
    onSelectTool: vi.fn(),
    onEscape: vi.fn(),
    onSpaceDown: vi.fn(),
    onSpaceUp: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetView: vi.fn(),
    onDelete: vi.fn(),
    onSelectAll: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onNudge: vi.fn(),
    onBringForward: vi.fn(),
    onSendBackward: vi.fn(),
    onBringToFront: vi.fn(),
    onSendToBack: vi.fn(),
    onFlipHorizontal: vi.fn(),
    onFlipVertical: vi.fn(),
    onEditLink: vi.fn(),
    onToggleLock: vi.fn(),
    onHide: vi.fn(),
    onDuplicate: vi.fn(),
    onZoomTo100: vi.fn(),
    onZoomToFit: vi.fn(),
    onZoomToSelection: vi.fn(),
    onCopy: vi.fn(),
    onCopyAsPng: vi.fn(),
    onCut: vi.fn(),
    onPaste: vi.fn(),
    onShowHelp: vi.fn(),
    onToggleTheme: vi.fn(),
    onToggleGrid: vi.fn(),
    onToggleSnapping: vi.fn(),
    onToggleToolLock: vi.fn(),
    onToggleFocusMode: vi.fn(),
    onToggleViewMode: vi.fn(),
    onToggleCanvasStats: vi.fn(),
    onToggleComments: vi.fn(),
    onOpenFile: vi.fn(),
    onSaveFile: vi.fn(),
    onExportImage: vi.fn(),
    onFind: vi.fn(),
    onCommandPalette: vi.fn(),
  } satisfies Parameters<typeof useKeyboardShortcuts>[0];
}

describe('flip keyboard dispatch', () => {
  let keydown: (event: KeyboardEvent) => void;
  let callbacks: ReturnType<typeof handlers>;

  beforeEach(() => {
    callbacks = handlers();
    vi.stubGlobal('window', {
      addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function press(overrides: Partial<KeyboardEvent> = {}) {
    const event = {
      code: 'KeyH',
      key: 'H',
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as KeyboardEvent;
    keydown(event);
    return event;
  }

  it('dispatches each flip once before the hand or select tool can handle the letter', () => {
    useKeyboardShortcuts(callbacks);
    expect(press().preventDefault).toHaveBeenCalledOnce();
    expect(press({ code: 'KeyV', key: 'V' }).preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onFlipHorizontal).toHaveBeenCalledOnce();
    expect(callbacks.onFlipVertical).toHaveBeenCalledOnce();
    expect(callbacks.onSelectTool).not.toHaveBeenCalled();
  });

  it('consumes held flip keys without flipping again or switching tools', () => {
    useKeyboardShortcuts(callbacks);
    expect(press({ repeat: true }).preventDefault).toHaveBeenCalledOnce();
    expect(press({ code: 'KeyV', key: 'V', repeat: true }).preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onFlipHorizontal).not.toHaveBeenCalled();
    expect(callbacks.onFlipVertical).not.toHaveBeenCalled();
    expect(callbacks.onSelectTool).not.toHaveBeenCalled();
  });

  it('keeps bare H and V selecting the hand and select tools', () => {
    useKeyboardShortcuts(callbacks);
    press({ key: 'h', shiftKey: false });
    press({ code: 'KeyV', key: 'v', shiftKey: false });
    expect(callbacks.onSelectTool.mock.calls).toEqual([['hand'], ['select']]);
    expect(callbacks.onFlipHorizontal).not.toHaveBeenCalled();
    expect(callbacks.onFlipVertical).not.toHaveBeenCalled();
  });

  it('leaves platform paste combinations to the browser', () => {
    useKeyboardShortcuts(callbacks);
    for (const modifier of ['metaKey', 'ctrlKey']) {
      const event = press({ code: 'KeyV', key: 'V', [modifier]: true });
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(callbacks.onFlipVertical).not.toHaveBeenCalled();
    expect(callbacks.onSelectTool).not.toHaveBeenCalled();
  });

  it('leaves capital H and V in text fields and editable content', () => {
    useKeyboardShortcuts(callbacks);
    for (const target of [
      { tagName: 'INPUT', type: 'text' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      const event = press({ target: target as unknown as EventTarget });
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(callbacks.onFlipHorizontal).not.toHaveBeenCalled();
    expect(callbacks.onSelectTool).not.toHaveBeenCalled();
  });

  it('does not handle flips while editor shortcuts are disabled', () => {
    useKeyboardShortcuts({ ...callbacks, disabled: true });
    expect(press().preventDefault).not.toHaveBeenCalled();
    expect(callbacks.onFlipHorizontal).not.toHaveBeenCalled();
  });
});

describe('link keyboard dispatch', () => {
  let keydown: (event: KeyboardEvent) => void;
  let callbacks: ReturnType<typeof handlers>;

  beforeEach(() => {
    callbacks = handlers();
    vi.stubGlobal('window', {
      addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function press(overrides: Partial<KeyboardEvent> = {}) {
    const event = {
      code: 'KeyK',
      key: 'k',
      shiftKey: false,
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as KeyboardEvent;
    keydown(event);
    return event;
  }

  it('opens the link field on Ctrl+K and Cmd+K, keeping the key from the browser', () => {
    useKeyboardShortcuts(callbacks);
    expect(press().preventDefault).toHaveBeenCalledOnce();
    expect(press({ ctrlKey: false, metaKey: true }).preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onEditLink).toHaveBeenCalledTimes(2);
    // Not the laser, which the bare letter picks.
    expect(callbacks.onSelectTool).not.toHaveBeenCalled();
  });

  it('leaves the bare letter to the laser pointer', () => {
    useKeyboardShortcuts(callbacks);
    press({ ctrlKey: false });
    expect(callbacks.onEditLink).not.toHaveBeenCalled();
    expect(callbacks.onSelectTool).toHaveBeenCalledWith('laser');
  });

  it('leaves the combo to a text field being typed in', () => {
    useKeyboardShortcuts(callbacks);
    const event = press({ target: { tagName: 'INPUT', type: 'text' } as unknown as EventTarget });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(callbacks.onEditLink).not.toHaveBeenCalled();
  });

  it('does not open it while editor shortcuts are disabled', () => {
    useKeyboardShortcuts({ ...callbacks, disabled: true });
    press();
    expect(callbacks.onEditLink).not.toHaveBeenCalled();
  });
});

describe('lock keyboard dispatch', () => {
  let keydown: (event: KeyboardEvent) => void;
  let callbacks: ReturnType<typeof handlers>;

  beforeEach(() => {
    callbacks = handlers();
    vi.stubGlobal('window', {
      addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function press(overrides: Partial<KeyboardEvent> = {}) {
    const event = {
      code: 'KeyL',
      key: 'L',
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as KeyboardEvent;
    keydown(event);
    return event;
  }

  it('locks on Shift+L instead of picking up the line tool', () => {
    useKeyboardShortcuts(callbacks);
    expect(press().preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onToggleLock).toHaveBeenCalledOnce();
    expect(callbacks.onSelectTool).not.toHaveBeenCalled();
  });

  it('toggles once for a held key', () => {
    useKeyboardShortcuts(callbacks);
    press();
    press({ repeat: true });
    press({ repeat: true });
    expect(callbacks.onToggleLock).toHaveBeenCalledOnce();
  });

  it('leaves the bare letter to the line tool, and a capital to a text field', () => {
    useKeyboardShortcuts(callbacks);
    press({ key: 'l', shiftKey: false });
    expect(callbacks.onSelectTool).toHaveBeenCalledWith('line');
    const typed = press({ target: { tagName: 'INPUT', type: 'text' } as unknown as EventTarget });
    expect(typed.preventDefault).not.toHaveBeenCalled();
    expect(callbacks.onToggleLock).not.toHaveBeenCalled();
  });
});

describe('hide keyboard dispatch', () => {
  let keydown: (event: KeyboardEvent) => void;
  let callbacks: ReturnType<typeof handlers>;

  beforeEach(() => {
    callbacks = handlers();
    vi.stubGlobal('window', {
      addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function press(overrides: Partial<KeyboardEvent> = {}) {
    const event = {
      code: 'KeyH',
      key: 'H',
      shiftKey: true,
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as KeyboardEvent;
    keydown(event);
    return event;
  }

  it('hides on Ctrl+Shift+H and Cmd+Shift+H, keeping the key from the browser', () => {
    useKeyboardShortcuts(callbacks);
    expect(press().preventDefault).toHaveBeenCalledOnce();
    press({ ctrlKey: false, metaKey: true });
    expect(callbacks.onHide).toHaveBeenCalledTimes(2);
    expect(callbacks.onFlipHorizontal).not.toHaveBeenCalled();
  });

  it('leaves Shift+H to flipping, and hides once for a held key', () => {
    useKeyboardShortcuts(callbacks);
    press({ ctrlKey: false });
    expect(callbacks.onFlipHorizontal).toHaveBeenCalledOnce();
    press();
    press({ repeat: true });
    expect(callbacks.onHide).toHaveBeenCalledOnce();
  });

  it('leaves the combo to a text field', () => {
    useKeyboardShortcuts(callbacks);
    press({ target: { tagName: 'TEXTAREA' } as unknown as EventTarget });
    expect(callbacks.onHide).not.toHaveBeenCalled();
  });
});

describe('copy as PNG keyboard dispatch', () => {
  let keydown: (event: KeyboardEvent) => void;
  let callbacks: ReturnType<typeof handlers>;

  beforeEach(() => {
    callbacks = handlers();
    vi.stubGlobal('window', {
      addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
        if (type === 'keydown') keydown = listener;
      },
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function press(overrides: Partial<KeyboardEvent> = {}) {
    const event = {
      code: 'KeyC',
      // What a Mac types for the combo; read by code, so it doesn't matter.
      key: 'Ç',
      shiftKey: true,
      metaKey: false,
      ctrlKey: false,
      altKey: true,
      repeat: false,
      target: null,
      preventDefault: vi.fn(),
      ...overrides,
    } as unknown as KeyboardEvent;
    keydown(event);
    return event;
  }

  it('copies on Shift+Alt+C, once for a held key', () => {
    useKeyboardShortcuts(callbacks);
    expect(press().preventDefault).toHaveBeenCalledOnce();
    press({ repeat: true });
    expect(callbacks.onCopyAsPng).toHaveBeenCalledOnce();
    expect(callbacks.onToggleComments).not.toHaveBeenCalled();
  });

  it('leaves Shift+C to the comments and the combo to a text field', () => {
    useKeyboardShortcuts(callbacks);
    press({ altKey: false, key: 'C' });
    expect(callbacks.onToggleComments).toHaveBeenCalledOnce();
    press({ target: { tagName: 'TEXTAREA' } as unknown as EventTarget });
    expect(callbacks.onCopyAsPng).not.toHaveBeenCalled();
  });
});
