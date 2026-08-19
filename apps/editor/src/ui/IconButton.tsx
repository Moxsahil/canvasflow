import type { FC, SVGProps } from 'react';
import './IconButton.css';

interface IconButtonProps {
  icon: FC<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  title: string;
  'aria-label': string;
  disabled?: boolean;
}

/**
 * Square icon button sized to the standard 2rem chrome row. Hover feedback is
 * suppressed while disabled, so an unavailable action (undo with nothing to
 * undo) reads as inert rather than merely unresponsive.
 */
export function IconButton({
  icon: Icon,
  onClick,
  title,
  'aria-label': ariaLabel,
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className="cf-icon-button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      <Icon width={16} height={16} />
    </button>
  );
}
