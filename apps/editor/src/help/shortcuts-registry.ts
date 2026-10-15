import type { TranslationKey } from '../i18n';

export interface ShortcutEntry {
  /** Primary key combo, e.g. 'mod+d' or 'r' or 'arrow-left' */
  keys: string;
  /** Optional alternative key combo, rendered after "or" */
  altKeys?: string;
  /** What the shortcut does */
  descriptionKey: TranslationKey;
}

export interface ShortcutCategory {
  /** Names the category in code; `titleKey` is what is shown. */
  title: string;
  titleKey: TranslationKey;
  entries: ShortcutEntry[];
}

export const SHORTCUTS: ShortcutCategory[] = [
  {
    title: 'Tools',
    titleKey: 'shortcuts.category.tools',
    entries: [
      { keys: 'h', descriptionKey: 'shortcuts.hand' },
      { keys: 'v', descriptionKey: 'shortcuts.selectTool' },
      { keys: 'r', descriptionKey: 'shortcuts.rectangle' },
      { keys: 'c', descriptionKey: 'shortcuts.ellipse' },
      { keys: 'd', descriptionKey: 'shortcuts.diamond' },
      { keys: 'l', descriptionKey: 'shortcuts.line' },
      { keys: 'a', descriptionKey: 'shortcuts.arrow' },
      { keys: 'p', descriptionKey: 'shortcuts.freehand' },
      { keys: 't', descriptionKey: 'shortcuts.text' },
      { keys: 'i', descriptionKey: 'shortcuts.image' },
      { keys: 'f', descriptionKey: 'shortcuts.frame' },
      { keys: 'x', descriptionKey: 'shortcuts.sketchToShape' },
      { keys: 'q', descriptionKey: 'shortcuts.toolLock' },
      { keys: 'k', descriptionKey: 'shortcuts.laserPointer' },
      { keys: 'm', descriptionKey: 'shortcuts.comment' },
      { keys: 'e', descriptionKey: 'shortcuts.eraser' },
    ],
  },
  {
    title: 'File',
    titleKey: 'shortcuts.category.file',
    entries: [
      { keys: 'mod+o', descriptionKey: 'shortcuts.openABoardFile' },
      { keys: 'mod+s', descriptionKey: 'shortcuts.saveTheBoardToAFile' },
      { keys: 'mod+shift+e', descriptionKey: 'shortcuts.exportAsAnImage' },
    ],
  },
  {
    title: 'Edit',
    titleKey: 'shortcuts.category.edit',
    entries: [
      { keys: 'mod+z', descriptionKey: 'shortcuts.undo' },
      { keys: 'mod+shift+z', altKeys: 'ctrl+y', descriptionKey: 'shortcuts.redo' },
      { keys: 'mod+c', descriptionKey: 'shortcuts.copySelection' },
      { keys: 'alt+shift+c', descriptionKey: 'shortcuts.copyAsPng' },
      { keys: 'mod+x', descriptionKey: 'shortcuts.cutSelection' },
      { keys: 'mod+v', descriptionKey: 'shortcuts.paste' },
      { keys: 'mod+d', descriptionKey: 'shortcuts.duplicateSelection' },
      { keys: 'delete', altKeys: 'backspace', descriptionKey: 'shortcuts.deleteSelection' },
      { keys: 'mod+a', descriptionKey: 'shortcuts.selectAll' },
      { keys: 'mod+k', descriptionKey: 'shortcuts.addOrEditALink' },
      { keys: 'mod+shift+h', descriptionKey: 'shortcuts.hideSelection' },
      { keys: 'escape', descriptionKey: 'shortcuts.deselectCancel' },
    ],
  },
  {
    title: 'Arrange',
    titleKey: 'shortcuts.category.arrange',
    entries: [
      { keys: 'arrow-left', descriptionKey: 'shortcuts.nudgeSelection1px' },
      { keys: 'shift+arrow-left', descriptionKey: 'shortcuts.nudgeSelection10px' },
      { keys: ']', descriptionKey: 'shortcuts.bringForward' },
      { keys: '[', descriptionKey: 'shortcuts.sendBackward' },
      { keys: 'mod+]', descriptionKey: 'shortcuts.bringToFront' },
      { keys: 'mod+[', descriptionKey: 'shortcuts.sendToBack' },
      { keys: 'shift+h', descriptionKey: 'shortcuts.flipHorizontal' },
      { keys: 'shift+v', descriptionKey: 'shortcuts.flipVertical' },
      { keys: 'shift+l', descriptionKey: 'shortcuts.lockOrUnlockSelection' },
    ],
  },
  {
    title: 'Search',
    titleKey: 'shortcuts.category.search',
    entries: [
      { keys: 'mod+/', altKeys: 'mod+shift+p', descriptionKey: 'shortcuts.openTheCommandPalette' },
      { keys: 'mod+f', descriptionKey: 'shortcuts.findOnCanvas' },
      { keys: 'enter', altKeys: 'shift+enter', descriptionKey: 'shortcuts.nextPreviousMatch' },
    ],
  },
  {
    title: 'View',
    titleKey: 'shortcuts.category.view',
    entries: [
      { keys: 'space+drag', descriptionKey: 'shortcuts.panCanvas' },
      { keys: 'scroll', descriptionKey: 'shortcuts.pan' },
      { keys: 'mod+scroll', descriptionKey: 'shortcuts.zoomAroundCursor' },
      { keys: 'mod+=', descriptionKey: 'shortcuts.zoomIn' },
      { keys: 'mod+-', descriptionKey: 'shortcuts.zoomOut' },
      { keys: 'mod+0', descriptionKey: 'shortcuts.resetZoom' },
      { keys: 'mod+1', descriptionKey: 'shortcuts.zoomTo100' },
      { keys: 'mod+2', descriptionKey: 'shortcuts.zoomToFitAll' },
      { keys: 'mod+3', descriptionKey: 'shortcuts.zoomToSelection' },
      { keys: "mod+'", descriptionKey: 'shortcuts.showOrHideTheGrid' },
      { keys: 'alt+s', descriptionKey: 'shortcuts.snapToNearbyShapes' },
      { keys: 'mod+drag', descriptionKey: 'shortcuts.snapForOneGesture' },
      { keys: 'alt+shift+d', descriptionKey: 'shortcuts.toggleLightDarkTheme' },
      { keys: 'alt+z', descriptionKey: 'shortcuts.focusMode' },
      { keys: 'alt+r', descriptionKey: 'shortcuts.viewMode' },
      { keys: 'alt+/', descriptionKey: 'shortcuts.canvasStats' },
      { keys: 'shift+c', descriptionKey: 'shortcuts.showOrHideComments' },
      { keys: 'shift+?', descriptionKey: 'shortcuts.showThisDialog' },
    ],
  },
];
