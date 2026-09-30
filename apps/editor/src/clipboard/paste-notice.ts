import { formatShortcut } from '../help/platform';
import type { Notice } from '../ui/NoticeDialog';

/**
 * What a menu's paste says when the clipboard gave it nothing.
 *
 * A page may ask for the clipboard's text and its pictures. It may not ask for
 * a file copied from a folder: the browser hands that over with the paste
 * keystroke and in no other way. A menu cannot tell that case from an empty
 * clipboard — both come back as nothing — so it says what to do about the one
 * that can be helped, and the keystroke that follows is treated as the rest of
 * the same paste.
 */
function pasteNotice(here: boolean): Notice {
  const key = formatShortcut('mod+v');
  return {
    title: here ? `Press ${key} to paste here` : `Press ${key} to paste`,
    body:
      'There is nothing on the clipboard that a menu is allowed to read. If you copied a file ' +
      `from a folder, your browser only hands it over on ${key} — press it now and it will ` +
      (here ? 'land where you pointed.' : 'be pasted.'),
    tone: 'warn',
  };
}

export const PASTE_NOTICE = pasteNotice(false);
export const PASTE_HERE_NOTICE = pasteNotice(true);

/** Whether the notice on show is one of the two asking for the paste keystroke. */
export function isPasteNotice(notice: Notice | null): boolean {
  return notice === PASTE_NOTICE || notice === PASTE_HERE_NOTICE;
}
