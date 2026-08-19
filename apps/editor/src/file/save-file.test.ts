import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBoardFile } from './save-file';

interface FakeHandle extends FileSystemFileHandle {
  written: string[];
}

/** A file handle that records what was written through it. */
function fakeHandle(name: string, { denyWrite = false } = {}): FakeHandle {
  const written: string[] = [];
  return {
    name,
    written,
    createWritable: async () => {
      if (denyWrite) {
        // What the browser throws when the user declines the write prompt on
        // a handle that was only ever granted read access.
        throw new DOMException('not allowed', 'NotAllowedError');
      }
      return {
        write: async (text: string) => {
          written.push(text);
        },
        close: async () => {},
      };
    },
  } as unknown as FakeHandle;
}

function stubDownloadEnvironment() {
  const link: Record<string, unknown> = { click: vi.fn(), remove: vi.fn(), style: {} };
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', {
    createElement: () => link,
    body: { append: vi.fn() },
  });
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:board', revokeObjectURL: vi.fn() });
  return link;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('saveBoardFile', () => {
  it('writes straight through an existing handle, without asking again', async () => {
    const handle = fakeHandle('board.canvasflow');
    const showSaveFilePicker = vi.fn();
    vi.stubGlobal('window', { showSaveFilePicker });

    const result = await saveBoardFile({ boardName: 'board', text: '{"a":1}', handle });

    expect(result).toEqual({ status: 'saved', handle, name: 'board.canvasflow' });
    expect(handle.written).toEqual(['{"a":1}']);
    expect(showSaveFilePicker).not.toHaveBeenCalled();
  });

  it('falls back to the picker when the handle cannot be written', async () => {
    // A handle carried over from opening a file grants read only; declining
    // the write prompt has to become "choose where to save", not a dead end.
    const denied = fakeHandle('read-only.canvasflow', { denyWrite: true });
    const picked = fakeHandle('chosen.canvasflow');
    vi.stubGlobal('window', { showSaveFilePicker: vi.fn().mockResolvedValue(picked) });

    const result = await saveBoardFile({ boardName: 'board', text: 'data', handle: denied });

    expect(result).toEqual({ status: 'saved', handle: picked, name: 'chosen.canvasflow' });
    expect(picked.written).toEqual(['data']);
  });

  it('reports a dismissed picker as cancelled rather than failed', async () => {
    vi.stubGlobal('window', {
      showSaveFilePicker: vi.fn().mockRejectedValue(new DOMException('go away', 'AbortError')),
    });

    await expect(saveBoardFile({ boardName: 'board', text: 'data' })).resolves.toEqual({
      status: 'cancelled',
    });
  });

  it('propagates a genuine picker failure', async () => {
    vi.stubGlobal('window', {
      showSaveFilePicker: vi.fn().mockRejectedValue(new Error('disk on fire')),
    });

    await expect(saveBoardFile({ boardName: 'board', text: 'data' })).rejects.toThrow(
      'disk on fire',
    );
  });

  it('downloads the file where the picker API is unavailable', async () => {
    const link = stubDownloadEnvironment();

    const result = await saveBoardFile({ boardName: 'my board', text: 'data' });

    expect(result).toEqual({ status: 'saved', handle: null, name: 'my board.canvasflow' });
    expect(link.download).toBe('my board.canvasflow');
    expect(link.click).toHaveBeenCalled();
  });

  it('keeps a board name usable as a filename', async () => {
    const link = stubDownloadEnvironment();

    await saveBoardFile({ boardName: 'boards/2026: q1?', text: 'data' });

    expect(link.download).toBe('boards-2026- q1-.canvasflow');
  });

  it('falls back to a generic name when the board has none', async () => {
    const link = stubDownloadEnvironment();

    await saveBoardFile({ boardName: '   ', text: 'data' });

    expect(link.download).toBe('board.canvasflow');
  });
});
