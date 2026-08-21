import { memo } from 'react';
import { presenceTagTextColor, type PresenceTheme } from '@canvasflow/canvas-engine';

interface PeerCursorProps {
  x: number;
  y: number;
  color: string;
  name: string;
  idle: boolean;
  theme: PresenceTheme;
}

export const PeerCursor = memo(function PeerCursor({
  x,
  y,
  color,
  name,
  idle,
  theme,
}: PeerCursorProps) {
  const halo = theme === 'dark' ? '#121212' : '#FFFFFF';

  return (
    <div
      className={`cf-cursor${idle ? ' cf-cursor--idle' : ''}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      aria-hidden="true"
    >
      <svg className="cf-cursor__arrow" width="13" height="17" viewBox="-1 -1 13 17">
        <path
          d="M0 0 L0 14 L4 9 L11 8 Z"
          fill={color}
          stroke={halo}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {name && (
        <span
          className="cf-cursor__name"
          style={{ background: color, color: presenceTagTextColor(theme) }}
        >
          {name}
        </span>
      )}
    </div>
  );
});
