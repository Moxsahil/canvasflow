import { useT } from '../i18n';
import { DiagramMark } from './DiagramMark';

/**
 * What opens the diagrams panel, beside Share. How many diagrams are left is
 * the panel's to say, at the foot of its sidebar.
 */
export function DiagramsButton({
  open,
  onToggle,
  onWarm,
}: {
  open: boolean;
  onToggle: () => void;
  /** About to be opened, perhaps: a pointer on it, or focus. */
  onWarm?: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      onPointerEnter={onWarm}
      onFocus={onWarm}
      aria-pressed={open}
      data-testid="diagrams-button"
      className="flex h-9 items-center gap-1.5 rounded-full border border-(--default-border-color) bg-(--island-bg-color) pr-3 pl-2.5 text-xs font-medium text-(--text-primary-color) transition-colors hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none aria-pressed:bg-(--button-hover-bg)"
    >
      <DiagramMark className="size-4 text-(--color-primary)" />
      <span>{t('diagrams.button')}</span>
    </button>
  );
}
