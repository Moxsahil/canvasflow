import { useT } from '../i18n';
import { DiagramMark } from './DiagramMark';

/**
 * What opens the diagrams panel, beside Share. Says how many diagrams are left
 * this month once that is known, so the count is in view before it is spent.
 */
export function DiagramsButton({
  open,
  left,
  onToggle,
}: {
  open: boolean;
  /** Diagrams left this month, or null until the count has been read. */
  left: number | null;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      aria-label={left === null ? t('diagrams.title') : t('diagrams.buttonLeft', { left })}
      data-testid="diagrams-button"
      className="flex h-9 items-center gap-1.5 rounded-full border border-(--default-border-color) bg-(--island-bg-color) pr-3 pl-2.5 text-xs font-medium text-(--text-primary-color) transition-colors hover:bg-(--button-hover-bg) focus-visible:shadow-[0_0_0_2px_var(--focus-highlight-color)] focus-visible:outline-none aria-pressed:bg-(--button-hover-bg)"
    >
      <DiagramMark className="size-4 text-(--color-primary)" />
      <span>{t('diagrams.title')}</span>
      {left !== null && (
        <span className="font-normal text-(--icon-fill-color) tabular-nums" aria-hidden="true">
          {left}
        </span>
      )}
    </button>
  );
}
