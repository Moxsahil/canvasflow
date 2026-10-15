import { t } from '../i18n';

/**
 * Detect if the user is on a Mac. Used to choose the right modifier
 * symbol in keyboard shortcut labels (⌘ on Mac, Ctrl on Windows/Linux).
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;

  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string };
    }
  ).userAgentData;
  if (uaData?.platform) {
    return uaData.platform === 'macOS';
  }

  return /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
}

/**
 * Convert a shortcut key string into an array of platform-appropriate
 * key symbols, one per pill in the UI.
 *
 * @example formatShortcutKeys('mod+shift+z')
 *   → ['⌘', '⇧', 'Z']  (Mac)
 *   → ['Ctrl', 'Shift', 'Z']  (Windows/Linux)
 */
export function formatShortcutKeys(keys: string): string[] {
  const mac = isMac();
  const parts = keys.split('+');
  const symbols: string[] = [];

  for (const part of parts) {
    const p = part.toLowerCase().trim();
    switch (p) {
      case 'mod':
        symbols.push(mac ? '⌘' : t('keys.ctrl'));
        break;
      case 'shift':
        symbols.push(mac ? '⇧' : t('keys.shift'));
        break;
      case 'alt':
        symbols.push(mac ? '⌥' : t('keys.alt'));
        break;
      case 'ctrl':
        symbols.push(t('keys.ctrl'));
        break;
      case 'cmd':
        symbols.push('⌘');
        break;
      case 'arrow-left':
        symbols.push('←');
        break;
      case 'arrow-right':
        symbols.push('→');
        break;
      case 'arrow-up':
        symbols.push('↑');
        break;
      case 'arrow-down':
        symbols.push('↓');
        break;
      case 'space':
        symbols.push(t('keys.space'));
        break;
      case 'enter':
        symbols.push(t('keys.enter'));
        break;
      case 'escape':
        symbols.push(t('keys.escape'));
        break;
      case 'delete':
        symbols.push(mac ? t('keys.delete') : t('keys.del'));
        break;
      case 'backspace':
        symbols.push(t('keys.backspace'));
        break;
      case 'tab':
        symbols.push(t('keys.tab'));
        break;
      case 'scroll':
        symbols.push(t('keys.scroll'));
        break;
      case 'drag':
        symbols.push(t('keys.drag'));
        break;
      default:
        // Single chars — uppercase for display
        symbols.push(p.toUpperCase());
    }
  }

  return symbols;
}

/**
 * A shortcut in `mod+x` notation, as `aria-keyshortcuts` spells it — for a
 * menu row with no room to print its key, so assistive technology can still
 * say it.
 *
 * @example ariaKeyShortcut('mod+shift+e') → 'Control+Shift+E' (Meta on a Mac)
 */
export function ariaKeyShortcut(keys: string): string {
  const names: Record<string, string> = {
    mod: isMac() ? 'Meta' : 'Control',
    shift: 'Shift',
    alt: 'Alt',
    delete: 'Delete',
  };
  return keys
    .split('+')
    .map((part) => names[part] ?? part.toUpperCase())
    .join('+');
}

/**
 * Legacy single-string formatter, kept for backward compatibility.
 * Prefer formatShortcutKeys for pill-based rendering.
 */
export function formatShortcut(keys: string): string {
  const symbols = formatShortcutKeys(keys);
  return isMac() ? symbols.join('') : symbols.join('+');
}
