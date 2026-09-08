import type { FC, SVGProps } from 'react';
import './IconButton.css';

interface IconButtonProps {
  icon: FC<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  /** Native tooltip. Omitted inside the dock, which draws its own. */
  title?: string;
  'aria-label': string;
  disabled?: boolean;
  /**
   * Makes this a toggle rather than an action: it gains `aria-pressed`, and
   * the on state is painted like a chosen tool. Leave unset for buttons that
   * simply do a thing.
   */
  pressed?: boolean;
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
  pressed,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className="cf-icon-button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      data-pressed={pressed ? '' : undefined}
    >
      <Icon width={16} height={16} />
    </button>
  );
}
