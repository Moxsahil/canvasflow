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
        symbols.push(mac ? '⌘' : 'Ctrl');
        break;
      case 'shift':
        symbols.push(mac ? '⇧' : 'Shift');
        break;
      case 'alt':
        symbols.push(mac ? '⌥' : 'Alt');
        break;
      case 'ctrl':
        symbols.push('Ctrl');
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
        symbols.push('Space');
        break;
      case 'enter':
        symbols.push('Enter');
        break;
      case 'escape':
        symbols.push('Esc');
        break;
      case 'delete':
        symbols.push(mac ? 'Delete' : 'Del');
        break;
      case 'backspace':
        symbols.push('Backspace');
        break;
      case 'tab':
        symbols.push('Tab');
        break;
      case 'scroll':
        symbols.push('Scroll');
        break;
      case 'drag':
        symbols.push('Drag');
        break;
      default:
        // Single chars — uppercase for display
        symbols.push(p.toUpperCase());
    }
  }

  return symbols;
}

/**
 * Legacy single-string formatter, kept for backward compatibility.
 * Prefer formatShortcutKeys for pill-based rendering.
 */
export function formatShortcut(keys: string): string {
  const symbols = formatShortcutKeys(keys);
  return isMac() ? symbols.join('') : symbols.join('+');
}
