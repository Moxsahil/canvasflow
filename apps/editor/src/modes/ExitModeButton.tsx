import { Eye, Maximize } from 'lucide-react';
import { formatShortcut } from '../help/platform';
import { useT } from '../i18n';

/** The two preferences that put the chrome away; see preferences.ts. */
export type ChromeHiddenMode = 'focus' | 'view';

interface ExitModeButtonProps {
  mode: ChromeHiddenMode;
  onExit: () => void;
}

/**
 * The one control left when the chrome is put away, standing in the top-right
 * dock where the share button stands the rest of the time. It says the way out,
 * with the icon the command palette lists the mode under.
 */
export function ExitModeButton({ mode, onExit }: ExitModeButtonProps) {
  const t = useT();
  const exit = mode === 'view' ? t('modes.exitView') : t('modes.exitFocus');
  const shortcut = formatShortcut(mode === 'view' ? 'alt+r' : 'alt+z');

  return (
    <button
      type="button"
      onClick={onExit}
      title={`${exit} · ${shortcut}`}
      aria-label={`${exit} · ${shortcut}`}
      data-testid="exit-mode"
      className="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-(--default-border-color) bg-(--island-bg-color) px-4 text-xs font-semibold text-(--text-primary-color) outline-none hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] [&_svg]:size-4"
    >
      {mode === 'view' ? <Eye /> : <Maximize />}
      {exit}
    </button>
  );
}
