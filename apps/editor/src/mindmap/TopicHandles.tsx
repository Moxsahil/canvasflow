import type { ReactNode } from 'react';
import { ArrowDown, ArrowRight, Minus } from 'lucide-react';
import {
  fontSizeOf,
  SELECTION_COLOR,
  topicAnchor,
  topicSize,
  type TopicShape,
} from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import type { Camera } from '../machine/tool-machine.types';
import type { TopicGrowth } from './mind-map-ops';

interface TopicHandlesProps {
  /** The selected topic, where its map has placed it. */
  topic: TopicShape;
  camera: Camera;
  /** The centre of its map, which has no siblings. */
  isRoot: boolean;
  /** Which way its branches grow from it — see `topicGrowth`. */
  growth: 'right' | 'left' | 'down';
  /** Whether anything branches from it, which is what there is to fold. */
  hasBranches: boolean;
  onGrow: (growth: TopicGrowth) => void;
  onFold: () => void;
}

/** Room around a dot for the pointer to find it, in screen pixels. */
const HIT = 24;
/** How far a dot stands off the topic's edge. */
const OFFSET = 18;

/**
 * The dots around a selected topic: one off the side its branches grow from,
 * for a topic under it, and one where a sibling would go — below it, or to
 * its right in a map hung down — for a topic beside it: Tab and Enter, for
 * whoever has a pointer in hand. Each opens into a button when the pointer
 * finds it. A topic with branches also gets a dot where they leave it, which
 * folds them away.
 *
 * Over the canvas rather than on it, so a press on one never reaches the
 * board to select or drag the topic beneath.
 */
export function TopicHandles({
  topic,
  camera,
  isRoot,
  growth,
  hasBranches,
  onGrow,
  onFold,
}: TopicHandlesProps) {
  const t = useT();
  const { width, height } = topicSize(topic);
  const zoom = camera.zoom;
  const screen = (point: { x: number; y: number }) => ({
    x: (point.x - camera.x) * zoom,
    y: (point.y - camera.y) * zoom,
  });
  // Where its branches leave it, and the way out from there.
  const from = screen(topicAnchor(topic, growth === 'down' ? 'bottom' : growth));
  const out = growth === 'down' ? { x: 0, y: 1 } : { x: growth === 'left' ? -1 : 1, y: 0 };
  const along = (distance: number) => ({
    x: from.x + out.x * distance,
    y: from.y + out.y * distance,
  });
  // The fold dot sits on the branches just as they leave the topic, and the
  // dot for a new one beyond it, short of where the next topic starts.
  const foldAt = 10;
  const open = hasBranches && topic.collapsed !== true;
  // Past the count a folded topic shows, which is drawn a font's height out.
  const growAt = open
    ? foldAt + OFFSET + 8
    : topic.collapsed
      ? fontSizeOf(topic) * zoom * 1.6 + OFFSET
      : OFFSET;
  const child = along(growAt);
  const fold = along(foldAt);
  const topLeft = screen(topic);
  const sibling =
    growth === 'down'
      ? { x: topLeft.x + width * zoom + OFFSET, y: topLeft.y + (height * zoom) / 2 }
      : { x: topLeft.x + (width * zoom) / 2, y: topLeft.y + height * zoom + OFFSET };
  const ChildIcon = growth === 'down' ? ArrowDown : ArrowRight;
  const SiblingIcon = growth === 'down' ? ArrowRight : ArrowDown;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-(--zIndex-wysiwyg) overflow-hidden"
      data-testid="topic-handles"
    >
      <Dot x={child.x} y={child.y} label={t('mindMap.addChild')} onPress={() => onGrow('child')}>
        <ChildIcon className={cn('size-3.5', growth === 'left' && '-scale-x-100')} />
      </Dot>
      {!isRoot && (
        <Dot
          x={sibling.x}
          y={sibling.y}
          label={t('mindMap.addSibling')}
          onPress={() => onGrow('sibling')}
        >
          <SiblingIcon className="size-3.5" />
        </Dot>
      )}
      {open && (
        <Dot x={fold.x} y={fold.y} label={t('mindMap.fold')} onPress={onFold}>
          <Minus className="size-3.5" />
        </Dot>
      )}
    </div>
  );
}

function Dot({
  x,
  y,
  label,
  onPress,
  children,
}: {
  x: number;
  y: number;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="group pointer-events-auto absolute flex items-center justify-center rounded-full outline-none"
      style={{ left: x - HIT / 2, top: y - HIT / 2, width: HIT, height: HIT }}
      // Kept from the board, which would take the press for a click on the
      // topic underneath and start a drag.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      <span
        // The selection's own colour: these belong to the selected topic.
        style={{ backgroundColor: SELECTION_COLOR }}
        className="flex size-2 items-center justify-center rounded-full text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-[width,height] duration-100 group-hover:size-[22px] group-focus-visible:size-[22px]"
      >
        <span className="hidden group-hover:flex group-focus-visible:flex">{children}</span>
      </span>
    </button>
  );
}
