import { useEffect, useState, type RefObject } from 'react';
import {
  isArrow,
  isNote,
  isPeerFresh,
  isText,
  isTopic,
  layoutMindMaps,
  type Peer,
  type Shape,
} from '@canvasflow/canvas-engine';
import { topicTextPatch } from '../mindmap/mind-map-ops';

/** What everyone else is typing right now, by the shape they are typing into. */
export type PeerTyping = ReadonlyMap<string, string>;

const NONE: PeerTyping = new Map();

function typingFrom(peers: readonly Peer[]): PeerTyping {
  const now = Date.now();
  const out = new Map<string, string>();
  for (const peer of peers) {
    if (!peer.typing || peer.activity === 'away' || !isPeerFresh(peer, now)) continue;
    out.set(peer.typing.shapeId, peer.typing.text);
  }
  return out.size === 0 ? NONE : out;
}

function same(a: PeerTyping, b: PeerTyping): boolean {
  if (a.size !== b.size) return false;
  for (const [id, text] of a) if (b.get(id) !== text) return false;
  return true;
}

/**
 * Collaborators' words in progress, as React state.
 *
 * Read off the presence stream, which moves at pointer rate, but only handed
 * on when the words themselves change — a keystroke, not a cursor — so the
 * board redraws once a letter rather than once a mouse move.
 */
export function usePeerTyping(
  peersRef: RefObject<readonly Peer[]>,
  subscribe: (listener: () => void) => () => void,
): PeerTyping {
  const [typing, setTyping] = useState<PeerTyping>(NONE);
  useEffect(() => {
    const read = () => {
      const next = typingFrom(peersRef.current ?? []);
      setTyping((current) => (same(current, next) ? current : next));
    };
    read();
    return subscribe(read);
  }, [peersRef, subscribe]);
  return typing;
}

/**
 * The board drawn with everyone else's words in progress: a text or a note
 * holding what is being typed into it, an arrow its label, a topic its words — with
 * its map making room around them, as it does for the person typing.
 *
 * `except` is the shape open here, whose words this client's own overlay
 * already shows.
 */
export function withPeerTyping(
  shapes: readonly Shape[],
  typing: PeerTyping,
  except: string | null,
): readonly Shape[] {
  if (typing.size === 0) return shapes;
  let topics = false;
  const next = shapes.map((shape) => {
    const text = typing.get(shape.id);
    if (text === undefined || shape.id === except) return shape;
    if (isText(shape) || isNote(shape)) return text === shape.text ? shape : { ...shape, text };
    if (isArrow(shape)) return text === shape.label ? shape : { ...shape, label: text };
    if (isTopic(shape) && text !== shape.text) {
      topics = true;
      return { ...shape, ...topicTextPatch(shapes, shape, text) } as Shape;
    }
    return shape;
  });
  return topics ? layoutMindMaps(next) : next;
}
