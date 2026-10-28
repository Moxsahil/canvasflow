import { Plus } from 'lucide-react';
import { noteBounds, noteFootHeight, shapeScale, type NoteShape } from '@canvasflow/canvas-engine';
import { useT } from '../i18n';
import type { Camera } from '../machine/tool-machine.types';
import { HandleDot } from '../mindmap/TopicHandles';
import type { NoteSide } from './note-neighbours';

interface NoteHandlesProps {
  /** The one note selected. */
  note: NoteShape;
  camera: Camera;
  onAdd: (side: NoteSide) => void;
}

/** How far a dot stands off the paper's edge, clear of the resize handles. */
const OFFSET = 18;

const LABELS = {
  up: 'notes.addAbove',
  right: 'notes.addRight',
  down: 'notes.addBelow',
  left: 'notes.addLeft',
} as const;

/**
 * The dots around a selected note, one off each side, for the next note
 * that way: Tab and Ctrl+Enter, for whoever has a pointer in hand. A note
 * already standing there is opened instead of a new one put on top of it.
 *
 * Not on a touch screen, where a finger would land on them going for the
 * resize handles they sit beside. Down to the one below on a note too small
 * on screen to hold four apart, and none once it is smaller still.
 */
export function NoteHandles({ note, camera, onAdd }: NoteHandlesProps) {
  const t = useT();
  const onScreen = camera.zoom * shapeScale(note);
  if (onScreen < 0.25) return null;
  const paper = noteBounds(note);
  const left = (paper.x - camera.x) * camera.zoom;
  const top = (paper.y - camera.y) * camera.zoom;
  const width = paper.width * camera.zoom;
  const height = paper.height * camera.zoom;
  const dots: Array<[NoteSide, number, number]> = [
    ['up', left + width / 2, top - OFFSET],
    ['right', left + width + OFFSET, top + height / 2],
    // Past the strip under the paper, clear of the heart and the name.
    ['down', left + width / 2, top + height + noteFootHeight(note) * camera.zoom + OFFSET / 2],
    ['left', left - OFFSET, top + height / 2],
  ];
  const shown = onScreen < 0.5 ? dots.filter(([side]) => side === 'down') : dots;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-(--zIndex-wysiwyg) overflow-hidden pointer-coarse:hidden"
      data-testid="note-handles"
    >
      {shown.map(([side, x, y]) => (
        <HandleDot key={side} x={x} y={y} label={t(LABELS[side])} onPress={() => onAdd(side)}>
          <Plus className="size-3.5" />
        </HandleDot>
      ))}
    </div>
  );
}
