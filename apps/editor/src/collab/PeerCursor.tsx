import { memo } from 'react';
import type { PresenceTheme } from '@canvasflow/canvas-engine';
import { Cursor, CursorBody, CursorName, CursorPointer } from '@/components/ui/cursor';

interface PeerCursorProps {
  x: number;
  y: number;
  color: string;
  name: string;
  idle: boolean;
  theme: PresenceTheme;
}

/**
 * The name tag is a wash of the peer's colour rather than a solid fill of it:
 * the palette entry plays the saturated role (Tailwind's `-500`/`-700`), and
 * the tag background is that colour let down towards the board (`-50`). One
 * palette entry drives both, so a peer stays one recognisable colour.
 */
function tagBackground(color: string, theme: PresenceTheme): string {
  return theme === 'dark'
    ? `color-mix(in srgb, ${color} 22%, #121212)`
    : `color-mix(in srgb, ${color} 12%, #ffffff)`;
}

export const PeerCursor = memo(function PeerCursor({
  x,
  y,
  color,
  name,
  idle,
  theme,
}: PeerCursorProps) {
  return (
    <Cursor
      className={`cf-cursor${idle ? ' cf-cursor--idle' : ''}`}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      aria-hidden="true"
    >
      <CursorPointer className="cf-cursor__arrow" style={{ color }} />
      {name && (
        <CursorBody
          className="cf-cursor__name"
          // Inline rather than a class: the colour is a runtime value, so
          // Tailwind has nothing to generate at build time.
          style={{ background: tagBackground(color, theme), color }}
        >
          <CursorName>{name}</CursorName>
        </CursorBody>
      )}
    </Cursor>
  );
});
