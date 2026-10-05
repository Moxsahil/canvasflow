import { describe, expect, it } from 'vitest';
import {
  CANVAS_MENU,
  CONTEXT_MENU_ITEMS,
  SELECTION_MENU,
  contextMenuFor,
  type ContextMenuGroup,
  type ContextMenuItemId,
} from './context-menu-items';

/** Every row id in a menu, submenus opened out. */
function idsIn(groups: readonly ContextMenuGroup[]): ContextMenuItemId[] {
  return groups.flatMap((group) =>
    group.flatMap((entry) => (typeof entry === 'string' ? [entry] : entry.items)),
  );
}

describe('the two menus', () => {
  it('shows no row twice within one menu', () => {
    for (const menu of [SELECTION_MENU, CANVAS_MENU]) {
      const ids = idsIn(menu);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('places every row in one menu or the other, so none is written and never shown', () => {
    const placed = new Set([...idsIn(SELECTION_MENU), ...idsIn(CANVAS_MENU)]);
    const unplaced = Object.keys(CONTEXT_MENU_ITEMS).filter(
      (id) => !placed.has(id as ContextMenuItemId),
    );
    expect(unplaced).toEqual([]);
  });

  it('keeps rows that act on a selection off the board menu', () => {
    const canvas = new Set(idsIn(CANVAS_MENU));
    for (const id of ['cut', 'copy', 'duplicate', 'deleteSelection', 'bringToFront'] as const) {
      expect(canvas.has(id)).toBe(false);
    }
  });

  it('offers Paste here straight after Paste, on a shape and on empty board alike', () => {
    for (const menu of [SELECTION_MENU, CANVAS_MENU]) {
      const ids = idsIn(menu);
      expect(ids[ids.indexOf('paste') + 1]).toBe('pasteHere');
    }
    // It changes the board, so a viewer is not shown it.
    expect(idsIn(contextMenuFor('canvas', { readOnly: true }))).not.toContain('pasteHere');
  });

  it('keeps Lock and Unlock all away from a viewer, who cannot change the board', () => {
    expect(idsIn(contextMenuFor('selection', { readOnly: true }))).not.toContain('lock');
    expect(idsIn(contextMenuFor('canvas', { readOnly: true }))).not.toContain('unlockAll');
    expect(idsIn(contextMenuFor('selection', { readOnly: false }))).toContain('lock');
    expect(idsIn(contextMenuFor('canvas', { readOnly: false }))).toContain('unlockAll');
  });

  it('offers Show all beside Unlock all, and Hide beside Lock, to editors only', () => {
    const canvas = idsIn(contextMenuFor('canvas', { readOnly: false }));
    expect(canvas[canvas.indexOf('unlockAll') + 1]).toBe('showAll');
    const selection = idsIn(contextMenuFor('selection', { readOnly: false }));
    expect(selection[selection.indexOf('lock') - 1]).toBe('hide');
    expect(idsIn(contextMenuFor('canvas', { readOnly: true }))).not.toContain('showAll');
    expect(idsIn(contextMenuFor('selection', { readOnly: true }))).not.toContain('hide');
  });

  it('lets a viewer copy a link to the selection, but not add one', () => {
    const ids = idsIn(contextMenuFor('selection', { readOnly: true }));
    expect(ids).toContain('copyLinkToSelection');
    expect(ids).not.toContain('addLink');
  });

  it('ends the selection menu with Delete, on its own', () => {
    expect(SELECTION_MENU.at(-1)).toEqual(['deleteSelection']);
    expect(CONTEXT_MENU_ITEMS.deleteSelection.destructive).toBe(true);
  });
});

describe('row metadata', () => {
  it('takes the shortcut of a built row from the command that runs it', () => {
    expect(CONTEXT_MENU_ITEMS.cut.shortcut).toBe('mod+x');
    expect(CONTEXT_MENU_ITEMS.duplicate.shortcut).toBe('mod+d');
    expect(CONTEXT_MENU_ITEMS.bringToFront.shortcut).toBe('mod+]');
    expect(CONTEXT_MENU_ITEMS.bringForward.shortcut).toBe(']');
    expect(CONTEXT_MENU_ITEMS.flipHorizontal.shortcut).toBe('shift+h');
    expect(CONTEXT_MENU_ITEMS.flipVertical.shortcut).toBe('shift+v');
    expect(CONTEXT_MENU_ITEMS.addLink.shortcut).toBe('mod+k');
    expect(CONTEXT_MENU_ITEMS.lock.shortcut).toBe('shift+l');
    expect(CONTEXT_MENU_ITEMS.hide.shortcut).toBe('mod+shift+h');
    expect(CONTEXT_MENU_ITEMS.exportImage.shortcut).toBe('mod+shift+e');
  });

  it('takes a toggle row’s shortcut from the preference it flips', () => {
    expect(CONTEXT_MENU_ITEMS.showGrid).toMatchObject({ toggle: true, shortcut: "mod+'" });
    expect(CONTEXT_MENU_ITEMS.focusMode).toMatchObject({ toggle: true, shortcut: 'alt+z' });
    expect(CONTEXT_MENU_ITEMS.viewMode).toMatchObject({ toggle: true, shortcut: 'alt+r' });
    expect(CONTEXT_MENU_ITEMS.canvasStats).toMatchObject({ toggle: true, shortcut: 'alt+/' });
  });

  it('gives every row an icon except the toggles, which draw their on/off box instead', () => {
    const missing = Object.entries(CONTEXT_MENU_ITEMS)
      .filter(([, meta]) => !meta.toggle && !meta.icon)
      .map(([id]) => id);
    expect(missing).toEqual([]);
  });

  it('gives an unbuilt row no shortcut, since nothing would answer the key', () => {
    expect(CONTEXT_MENU_ITEMS.addToLibrary.shortcut).toBeUndefined();
    expect(CONTEXT_MENU_ITEMS.copyAsPng.shortcut).toBeUndefined();
  });
});

describe('contextMenuFor', () => {
  it('gives an editor every row of the menu the click called for', () => {
    expect(idsIn(contextMenuFor('selection', { readOnly: false }))).toEqual(idsIn(SELECTION_MENU));
    expect(idsIn(contextMenuFor('canvas', { readOnly: false }))).toEqual(idsIn(CANVAS_MENU));
  });

  it('leaves a viewer the rows that read the board and none that change it', () => {
    const ids = new Set(idsIn(contextMenuFor('selection', { readOnly: true })));

    expect(ids.has('copy')).toBe(true);
    expect(ids.has('exportImage')).toBe(true);
    expect(ids.has('cut')).toBe(false);
    expect(ids.has('paste')).toBe(false);
    expect(ids.has('deleteSelection')).toBe(false);
    expect(ids.has('bringToFront')).toBe(false);
    expect(ids.has('flipHorizontal')).toBe(false);
    expect(ids.has('flipVertical')).toBe(false);
  });

  it('drops a submenu with nothing left in it, and keeps one with something', () => {
    const entries = contextMenuFor('selection', { readOnly: true }).flat();
    const submenus = entries.flatMap((entry) => (typeof entry === 'string' ? [] : [entry]));
    const names = submenus.map((entry) => entry.submenu);

    expect(names).not.toContain('edit');
    expect(names).not.toContain('moveTo');
    expect(names).toContain('copyAs');
  });

  it('offers Move to with New board first, marked to list the workspace boards after it', () => {
    const moveTo = contextMenuFor('selection', { readOnly: false })
      .flat()
      .find((entry) => typeof entry !== 'string' && entry.submenu === 'moveTo');

    expect(moveTo).toMatchObject({
      label: 'Move to',
      items: ['moveToNewBoard'],
      listsBoards: true,
    });
    expect(CONTEXT_MENU_ITEMS.moveToNewBoard.label).toBe('New board');
  });

  it('offers the style panels on the board menu as a submenu of two choices', () => {
    const stylePanel = contextMenuFor('canvas', { readOnly: false })
      .flat()
      .find((entry) => typeof entry !== 'string' && entry.submenu === 'stylePanel');

    expect(stylePanel).toMatchObject({
      label: 'Style panel',
      items: ['stylePanelInspector', 'stylePanelHalo'],
      compact: true,
    });
    expect(CONTEXT_MENU_ITEMS.stylePanelInspector).toMatchObject({
      label: 'Inspector',
      choice: true,
    });
    expect(CONTEXT_MENU_ITEMS.stylePanelHalo).toMatchObject({ label: 'Halo', choice: true });
  });

  it('keeps the style panels from a viewer, who has no style controls', () => {
    const names = contextMenuFor('canvas', { readOnly: true })
      .flat()
      .flatMap((entry) => (typeof entry === 'string' ? [] : [entry.submenu]));

    expect(names).not.toContain('stylePanel');
  });

  it('sizes Copy as to its short rows, and lets the longer submenus take the usual width', () => {
    const submenus = contextMenuFor('selection', { readOnly: false })
      .flat()
      .flatMap((entry) => (typeof entry === 'string' ? [] : [entry]));
    const compact = Object.fromEntries(submenus.map((entry) => [entry.submenu, !!entry.compact]));

    expect(compact).toEqual({ copyAs: true, edit: false, moveTo: false });
  });

  it('leaves no empty group behind for a rule to sit over', () => {
    for (const target of ['selection', 'canvas'] as const) {
      for (const readOnly of [false, true]) {
        const groups = contextMenuFor(target, { readOnly });
        expect(groups.every((group) => group.length > 0)).toBe(true);
      }
    }
  });
});
