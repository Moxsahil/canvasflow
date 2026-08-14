import type { ReactNode } from 'react';
import { cn } from '@canvasflow/ui';

interface OptionButtonProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  /** Flip the glyph horizontally — start-of-arrow markers point the other way. */
  mirrored?: boolean;
  onClick: () => void;
}

/** A square icon button — the unit every non-color panel row is built from. */
export function OptionButton({
  icon,
  label,
  active,
  disabled,
  mirrored,
  onClick,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'cf-option-button',
        active && 'cf-option-button--active',
        mirrored && 'cf-option-button--mirrored',
      )}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
