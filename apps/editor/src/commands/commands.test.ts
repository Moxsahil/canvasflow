import { describe, expect, it } from 'vitest';
import { COMMANDS, COMMANDS_BY_ID, COMMAND_CATEGORIES, type CommandContext } from './commands';
import { TOOLS, VIEW_MODE_TOOL, VIEW_ONLY_TOOLS } from '../tools/tool';

const editing: CommandContext = {
  readOnly: false,
  viewMode: false,
  selectionCount: 1,
  editableSelectionCount: 1,
  canFlipSelection: true,
  shapeCount: 3,
  canUndo: true,
  canRedo: true,
  canRename: true,
  canUseLibrary: true,
  canBindText: true,
  canUnbindText: true,
  canWrapText: true,
};

const available = (context: CommandContext) =>
  COMMANDS.filter((command) => !command.available || command.available(context)).map((c) => c.id);

describe('the command registry', () => {
  it('gives every command a distinct id', () => {
    expect(new Set(COMMANDS.map((command) => command.id)).size).toBe(COMMANDS.length);
  });

  it('gives every command a label and an icon', () => {
    for (const command of COMMANDS) {
      expect(command.label, command.id).toBeTruthy();
      expect(command.icon, command.id).toBeTruthy();
    }
  });

  it('only uses categories the palette knows how to order', () => {
    for (const command of COMMANDS) {
      expect(COMMAND_CATEGORIES, command.id).toContain(command.category);
    }
  });

  it('offers every tool', () => {
    const tools = COMMANDS.filter((command) => command.category === 'Tools');
    expect(tools).toHaveLength(TOOLS.length);
    expect(tools.map((command) => command.id)).toEqual(TOOLS.map((tool) => `tool:${tool.id}`));
  });

  it('indexes every command by id', () => {
    expect(COMMANDS_BY_ID.size).toBe(COMMANDS.length);
  });

  it('does not offer to open the palette from inside the palette', () => {
    expect(COMMANDS_BY_ID.has('commandPalette' as never)).toBe(false);
  });
});

describe('availability', () => {
  it('offers everything while editing with a single shape selected', () => {
    // Every command in the registry applies in this state, which is what makes
    // it the useful baseline for the narrower cases below.
    expect(available(editing)).toHaveLength(COMMANDS.length);
  });

  it('withholds the drawing tools from a viewer but keeps the rest', () => {
    const ids = available({ ...editing, readOnly: true });
    for (const tool of TOOLS) {
      expect(ids.includes(`tool:${tool.id}`), tool.id).toBe(VIEW_ONLY_TOOLS.has(tool.id));
    }
  });

  it('leaves view mode the hand tool and nothing else', () => {
    // A press on the canvas pans in view mode, so a select or laser row here
    // would be a tool the canvas then ignores.
    const ids = available({ ...editing, readOnly: true, viewMode: true });
    for (const tool of TOOLS) {
      expect(ids.includes(`tool:${tool.id}`), tool.id).toBe(tool.id === VIEW_MODE_TOOL);
    }
    expect(ids).toContain('toggleViewMode');
  });

  it('withholds every command that would change the board from a viewer', () => {
    const ids = available({ ...editing, readOnly: true });
    for (const id of [
      'undo',
      'redo',
      'cut',
      'paste',
      'duplicate',
      'deleteSelection',
      'selectAll',
      'resetCanvas',
      'flipHorizontal',
      'flipVertical',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('leaves a viewer able to look around and to leave', () => {
    const ids = available({ ...editing, readOnly: true });
    for (const id of [
      'zoomIn',
      'zoomToFit',
      'toggleTheme',
      'toggleFocusMode',
      // View mode is read-only by choice, and the palette is one of the ways
      // out of it — which it cannot be if read-only takes the command away.
      'toggleViewMode',
      'toggleCanvasStats',
      'help',
      'settings',
      'signOut',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it('withholds edits from a selection that is all locked, but not copying or unlocking it', () => {
    const ids = available({ ...editing, editableSelectionCount: 0 });
    for (const id of ['cut', 'deleteSelection', 'bringToFront', 'sendBackward', 'editLink']) {
      expect(ids, id).not.toContain(id);
    }
    for (const id of ['copy', 'duplicate', 'copyLinkToSelection', 'toggleLock']) {
      expect(ids, id).toContain(id);
    }
  });

  it('hides a selection, locked or not, and shows hidden shapes on any board with some', () => {
    const lockedOnly = available({ ...editing, editableSelectionCount: 0 });
    expect(lockedOnly).toContain('hideSelection');
    expect(available({ ...editing, selectionCount: 0, editableSelectionCount: 0 })).not.toContain(
      'hideSelection',
    );
    expect(available({ ...editing, selectionCount: 0, editableSelectionCount: 0 })).toContain(
      'showAll',
    );
    const viewer = available({ ...editing, readOnly: true });
    expect(viewer).not.toContain('hideSelection');
    expect(viewer).not.toContain('showAll');
  });

  it('adds a selection to the library for any account, a viewer included, but not a guest', () => {
    expect(available(editing)).toContain('addToLibrary');
    expect(available({ ...editing, readOnly: true, editableSelectionCount: 0 })).toContain(
      'addToLibrary',
    );
    expect(available({ ...editing, canUseLibrary: false })).not.toContain('addToLibrary');
    expect(available({ ...editing, selectionCount: 0, editableSelectionCount: 0 })).not.toContain(
      'addToLibrary',
    );
  });

  it('offers moving words in and out of shapes only for a selection they apply to', () => {
    const none = { ...editing, canBindText: false, canUnbindText: false, canWrapText: false };
    for (const id of ['bindText', 'unbindText', 'wrapTextInContainer']) {
      expect(available(none), id).not.toContain(id);
      expect(available(editing), id).toContain(id);
      expect(available({ ...editing, readOnly: true }), id).not.toContain(id);
    }
  });

  it('keeps Unlock all for any board with shapes on it, and away from a viewer', () => {
    expect(available({ ...editing, selectionCount: 0, editableSelectionCount: 0 })).toContain(
      'unlockAll',
    );
    expect(available({ ...editing, shapeCount: 0 })).not.toContain('unlockAll');
    expect(available({ ...editing, readOnly: true })).not.toContain('unlockAll');
    expect(available({ ...editing, readOnly: true })).not.toContain('toggleLock');
  });

  it('withholds the selection commands when nothing is selected', () => {
    const ids = available({
      ...editing,
      selectionCount: 0,
      editableSelectionCount: 0,
      canFlipSelection: false,
    });
    for (const id of [
      'cut',
      'copy',
      'duplicate',
      'deleteSelection',
      'zoomToSelection',
      'flipHorizontal',
      'flipVertical',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('withholds the z-order commands unless exactly one shape is selected', () => {
    const zOrder = ['bringForward', 'sendBackward', 'bringToFront', 'sendToBack'];
    const many = available({ ...editing, selectionCount: 2 });
    for (const id of zOrder) expect(many, id).not.toContain(id);

    const one = available({ ...editing, selectionCount: 1 });
    for (const id of zOrder) expect(one, id).toContain(id);
  });

  it('offers flips only when the selection supports them, including multiple shapes', () => {
    const unsupported = available({ ...editing, canFlipSelection: false });
    const multiple = available({ ...editing, selectionCount: 3 });
    for (const id of ['flipHorizontal', 'flipVertical']) {
      expect(unsupported).not.toContain(id);
      expect(multiple).toContain(id);
    }
  });

  it('withholds undo and redo when their stacks are empty', () => {
    const ids = available({ ...editing, canUndo: false, canRedo: false });
    expect(ids).not.toContain('undo');
    expect(ids).not.toContain('redo');
  });

  it('withholds the commands that need shapes on an empty board', () => {
    const ids = available({
      ...editing,
      shapeCount: 0,
      selectionCount: 0,
      editableSelectionCount: 0,
    });
    expect(ids).not.toContain('zoomToFit');
    expect(ids).not.toContain('selectAll');
  });

  it('offers to reset the canvas whether or not there is anything on it', () => {
    // Reset recentres the view as well as clearing, so it still does something
    // on an empty board — and a row that comes and goes with the shape count
    // is a row you cannot learn the place of.
    expect(available({ ...editing, selectionCount: 0, editableSelectionCount: 0 })).toContain(
      'resetCanvas',
    );
    expect(
      available({ ...editing, shapeCount: 0, selectionCount: 0, editableSelectionCount: 0 }),
    ).toContain('resetCanvas');
  });

  it('withholds renaming a board this account may not retitle', () => {
    expect(available({ ...editing, canRename: false })).not.toContain('renameBoard');
  });
});
