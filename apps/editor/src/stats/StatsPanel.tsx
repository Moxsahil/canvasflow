import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Shape } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { ScrubField } from './ScrubField';
import {
  applyStatsEdit,
  boardSize,
  isStatsEditable,
  statsValue,
  type StatsEdit,
  type StatsPatch,
  type StatsProperty,
} from './stats-ops';
import { stripBottom } from './stats-placement';
import './StatsPanel.css';

interface StatsPanelProps {
  /** Everything on the board. */
  shapes: readonly Shape[];
  selectedShapes: readonly Shape[];
  /** Shows the numbers and lets none of them be changed. */
  readOnly: boolean;
  /** The width of the board the strip stands on, which decides the row it takes. */
  boardWidth: number;
  /** Geometry to write, mid-edit: a drag sends one of these for every step. */
  onEdit: (patches: readonly StatsPatch[]) => void;
  /** The edit is over — typed and entered, or the drag let go. */
  onEditEnd: (property: StatsProperty, ids: readonly string[]) => void;
  onClose: () => void;
}

const KIND_NAMES: Record<Shape['kind'], string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  line: 'Line',
  arrow: 'Arrow',
  freehand: 'Drawing',
  text: 'Text',
  image: 'Image',
  frame: 'Frame',
};

/**
 * The fields of the selection, in the order they are read: where, how big,
 * what size of type. A strip has room for a letter a field, so each is known
 * by its initial and says its name in full to a pointer resting on it.
 */
const FIELDS: readonly { property: StatsProperty; label: string; name: string }[] = [
  { property: 'x', label: 'X', name: 'X position' },
  { property: 'y', label: 'Y', name: 'Y position' },
  { property: 'width', label: 'W', name: 'Width' },
  { property: 'height', label: 'H', name: 'Height' },
  { property: 'fontSize', label: 'Aa', name: 'Font size' },
];

const mutedText = 'text-neutral-500 dark:text-neutral-400';
const divider = 'mx-1 h-4 w-px shrink-0 bg-(--dock-separator-color)';

/**
 * The numbers behind the board, on one line in its bottom-left corner: how
 * much is on it and how far it reaches, and for whatever is selected, where it
 * is and how big — each of those a field that can be typed into, or dragged by
 * its letter.
 *
 * Built as the dock and the zoom panel are, surface and height and corners, so
 * the three read as one bar along the bottom edge broken into its parts. It is
 * as long as what it has to say: the totals alone with nothing selected, and
 * the selection's fields after them when there is one.
 */
export function StatsPanel({
  shapes,
  selectedShapes,
  readOnly,
  boardWidth,
  onEdit,
  onEditEnd,
  onClose,
}: StatsPanelProps) {
  // Measuring the whole board is the one thing here that grows with it, and it
  // is asked for on every change to any shape. Deferred, a drag on a large
  // board is not held up so a total nobody is watching can keep pace with it.
  const measured = useDeferredValue(shapes);
  const size = useMemo(() => boardSize(measured), [measured]);

  // The dock is found rather than handed in: it is a sibling on the same
  // board, and its width changes with who is looking — a viewer's has fewer
  // tools in it.
  const rootRef = useRef<HTMLElement>(null);
  const [widths, setWidths] = useState({ dock: 0, strip: 0 });
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const dock = root.parentElement?.querySelector<HTMLElement>('.cf-bottom-dock') ?? null;

    const measure = () => {
      const next = { dock: dock?.offsetWidth ?? 0, strip: root.offsetWidth };
      setWidths((last) => (last.dock === next.dock && last.strip === next.strip ? last : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (dock) observer.observe(dock);
    measure();
    return () => observer.disconnect();
  }, []);

  const only = selectedShapes.length === 1 ? selectedShapes[0]! : null;
  const count = shapes.length;

  return (
    <aside
      ref={rootRef}
      aria-label="Canvas stats"
      className={cn(
        'cf-stats-strip absolute left-4 z-(--zIndex-layerUI) flex max-w-[calc(100%-2rem)] items-center gap-1 overflow-x-auto',
        'rounded-card border border-(--dock-border-color) bg-(--dock-bg-color) px-1.5 py-1',
        'text-xs whitespace-nowrap backdrop-blur-xl backdrop-saturate-150',
        // The dock's tokens paint the surface and nothing written on it: its
        // own buttons bring their colour with them. Numbers set straight on
        // the bar need the ink said here, or they take the page's — which is
        // dark, on a bar that in the dark theme is dark as well.
        'text-neutral-950 dark:text-neutral-50',
      )}
      style={{ bottom: stripBottom(boardWidth, widths.dock, widths.strip) }}
      data-testid="stats-panel"
    >
      <div
        role="group"
        aria-label="Canvas"
        className="flex h-7 shrink-0 items-center gap-2.5 rounded-md bg-neutral-950/5 px-2.5 tabular-nums dark:bg-neutral-50/5"
      >
        <span>
          <output className="font-medium" aria-label="Shapes">
            {count}
          </output>{' '}
          <span className={mutedText}>{count === 1 ? 'shape' : 'shapes'}</span>
        </span>
        <span>
          <output className="font-medium" aria-label="Width">
            {size.width}
          </output>
          <span className={mutedText}> × </span>
          <output className="font-medium" aria-label="Height">
            {size.height}
          </output>
        </span>
      </div>

      {selectedShapes.length > 0 && (
        <>
          <div role="separator" aria-orientation="vertical" className={divider} />
          <div role="group" aria-label="Selection" className="flex shrink-0 items-center gap-0.5">
            <span className="px-1.5 font-medium">
              {only ? KIND_NAMES[only.kind] : `${selectedShapes.length} shapes`}
            </span>
            {FIELDS.map((field) => (
              <SelectionField
                key={field.property}
                {...field}
                shapes={shapes}
                selectedShapes={selectedShapes}
                readOnly={readOnly}
                onEdit={onEdit}
                onEditEnd={onEditEnd}
              />
            ))}
          </div>
        </>
      )}

      <div role="separator" aria-orientation="vertical" className={divider} />
      <button
        type="button"
        aria-label="Close canvas stats"
        title="Close"
        className={cn(
          mutedText,
          'grid size-(--default-button-size) shrink-0 place-items-center rounded-(--border-radius-md) outline-none hover:bg-neutral-950/10 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-highlight-color) dark:hover:bg-neutral-50/10 dark:hover:text-neutral-50 [&_svg]:size-4',
        )}
        onClick={onClose}
        data-testid="stats-close"
      >
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}

/**
 * One property of the selection, and the edit it is in the middle of.
 *
 * What an edit acts on is settled when it starts — the shapes selected then,
 * on the board as it was then — and held until it ends. A drag needs the fixed
 * start to measure from; a typed number needs to land on what it was typed
 * about, even when the press that entered it has already selected something
 * else.
 */
function SelectionField({
  property,
  label,
  name,
  shapes,
  selectedShapes,
  readOnly,
  onEdit,
  onEditEnd,
}: {
  property: StatsProperty;
  label: string;
  name: string;
} & Pick<StatsPanelProps, 'shapes' | 'selectedShapes' | 'readOnly' | 'onEdit' | 'onEditEnd'>) {
  const now = useRef({ shapes, selectedShapes });
  now.current = { shapes, selectedShapes };
  const scrubbed = useRef<{ originals: readonly Shape[]; board: readonly Shape[] } | null>(null);
  const focused = useRef<readonly string[]>([]);

  const value = statsValue(selectedShapes, property);
  // Nothing selected has one: a font size, with no text in the selection.
  if (value === null) return null;

  const editable = !readOnly && selectedShapes.some((shape) => isStatsEditable(shape, property));

  const write = (edit: StatsEdit, originals: readonly Shape[], board: readonly Shape[]) => {
    const patches = applyStatsEdit(property, edit, originals, board);
    if (patches.length > 0) onEdit(patches);
  };

  return (
    <ScrubField
      label={label}
      name={name}
      value={value}
      editable={editable}
      onFocus={() => {
        focused.current = now.current.selectedShapes.map((shape) => shape.id);
      }}
      onSet={(next) => {
        // The shapes the field was focused on, as they are now.
        const ids = new Set(focused.current);
        const board = now.current.shapes;
        const originals = board.filter((shape) => ids.has(shape.id));
        write({ kind: 'set', value: next }, originals, board);
        onEditEnd(property, [...ids]);
      }}
      onScrubStart={() => {
        scrubbed.current = {
          originals: now.current.selectedShapes,
          board: now.current.shapes,
        };
      }}
      onScrub={(change, byStep) => {
        const start = scrubbed.current;
        if (start) write({ kind: 'scrub', change, byStep }, start.originals, start.board);
      }}
      onScrubEnd={() => {
        const start = scrubbed.current;
        scrubbed.current = null;
        if (start)
          onEditEnd(
            property,
            start.originals.map((shape) => shape.id),
          );
      }}
    />
  );
}
