import { formatShortcut } from '../help/platform';
import { t } from '../i18n';
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
export function pasteNotice(here: boolean): Notice {
  const key = formatShortcut('mod+v');
  const notice: Notice = {
    title: here ? t('paste.pressHere', { key }) : t('paste.press', { key }),
    body: here ? t('paste.bodyHere', { key }) : t('paste.body', { key }),
    tone: 'warn',
  };
  // Worded when shown, in the language on screen, so it is known by this
  // rather than by being one of two fixed objects.
  pasteNotices.add(notice);
  return notice;
}

const pasteNotices = new WeakSet<Notice>();

/** Whether the notice on show is one asking for the paste keystroke. */
export function isPasteNotice(notice: Notice | null): boolean {
  return notice !== null && pasteNotices.has(notice);
}
