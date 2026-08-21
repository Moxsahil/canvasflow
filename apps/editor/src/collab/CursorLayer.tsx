import { useEffect, useState } from 'react';
import {
  edgeHintFor,
  isCursorVisible,
  isPeerFresh,
  presenceColorFor,
  worldToScreen,
  type Peer,
  type PresenceCamera,
  type PresenceScreen,
  type PresenceTheme,
} from '@canvasflow/canvas-engine';
import { PeerCursor } from './PeerCursor';
import './collab.css';

interface CursorLayerProps {
  peersRef: React.MutableRefObject<readonly Peer[]>;
  subscribe: (listener: () => void) => () => void;
  camera: PresenceCamera;
  screen: PresenceScreen;
  theme: PresenceTheme;
}

export function CursorLayer({ peersRef, subscribe, camera, screen, theme }: CursorLayerProps) {
  const [, bump] = useState(0);

  useEffect(() => subscribe(() => bump((n) => n + 1)), [subscribe]);

  const now = Date.now();
  const peers = peersRef.current;
  if (peers.length === 0) return null;

  return (
    <div className="cf-cursor-layer">
      {peers.map((peer) => {
        // Away peers keep their avatar in the list but lose their cursor: a
        // pointer parked where someone left the tab reads as attention that
        // isn't there. Stale peers are dropped so a frozen cursor from an
        // unclean disconnect doesn't sit on the board looking alive.
        if (!peer.cursor || peer.activity === 'away' || !isPeerFresh(peer, now)) return null;

        const color = presenceColorFor(peer.user.id, theme);

        // One shared predicate decides which of the two renderers draws this
        // peer, so they stay exhaustive and mutually exclusive — no peer can
        // fall into a gap between them, or be drawn twice.
        if (!isCursorVisible(peer.cursor, camera, screen)) {
          const hint = edgeHintFor(peer.cursor, camera, screen);
          return (
            <span
              key={peer.clientId}
              className="cf-cursor-hint"
              style={{ transform: `translate(${hint.x}px, ${hint.y}px)` }}
              title={`${peer.user.name} — off screen`}
              aria-hidden="true"
            >
              <span className="cf-cursor-hint__dot" style={{ background: color }} />
            </span>
          );
        }

        const point = worldToScreen(peer.cursor, camera);
        return (
          <PeerCursor
            key={peer.clientId}
            x={point.x}
            y={point.y}
            color={color}
            name={peer.user.name}
            idle={peer.activity === 'idle'}
            theme={theme}
          />
        );
      })}
    </div>
  );
}
