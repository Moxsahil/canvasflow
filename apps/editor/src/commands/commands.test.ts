import { describe, expect, it } from 'vitest';
import { COMMANDS, COMMANDS_BY_ID, COMMAND_CATEGORIES, type CommandContext } from './commands';
import { TOOLS, VIEW_ONLY_TOOLS } from '../tools/tool';

const editing: CommandContext = {
  readOnly: false,
  selectionCount: 1,
  shapeCount: 3,
  canUndo: true,
  canRedo: true,
  canRename: true,
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
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });

  it('leaves a viewer able to look around and to leave', () => {
    const ids = available({ ...editing, readOnly: true });
    for (const id of ['zoomIn', 'zoomToFit', 'toggleTheme', 'help', 'settings', 'signOut']) {
      expect(ids, id).toContain(id);
    }
  });

  it('withholds the selection commands when nothing is selected', () => {
    const ids = available({ ...editing, selectionCount: 0 });
    for (const id of ['cut', 'copy', 'duplicate', 'deleteSelection', 'zoomToSelection']) {
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

  it('withholds undo and redo when their stacks are empty', () => {
    const ids = available({ ...editing, canUndo: false, canRedo: false });
    expect(ids).not.toContain('undo');
    expect(ids).not.toContain('redo');
  });

  it('withholds zoom-to-fit and select-all on an empty board', () => {
    const ids = available({ ...editing, shapeCount: 0, selectionCount: 0 });
    expect(ids).not.toContain('zoomToFit');
    expect(ids).not.toContain('selectAll');
  });

  it('withholds renaming a board this account may not retitle', () => {
    expect(available({ ...editing, canRename: false })).not.toContain('renameBoard');
  });
});
