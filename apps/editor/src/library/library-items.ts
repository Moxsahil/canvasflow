import {
  frameForShape,
  framesIn,
  hiddenShapeIds,
  isArrow,
  isFrame,
  isImage,
  isText,
  renderSceneToSvgString,
  sanitizeShape,
  type ArrowBinding,
  type Shape,
} from '@canvasflow/canvas-engine';
import { withFrameMembers } from '../frames/frame-ops';

/** The gateway's limit on a name. */
export const LIBRARY_NAME_MAX = 80;

/**
 * What an item carries while it is dragged onto the board: its id. A type of
 * our own, so the board can tell it from a file or text dragged in from
 * elsewhere while it is still over it.
 */
export const LIBRARY_DRAG_TYPE = 'application/x-canvasflow-library';

/** Where an item's name comes from when nothing in it is worded. */
const KIND_NAMES: Readonly<Record<Shape['kind'], string>> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  line: 'Line',
  arrow: 'Arrow',
  freehand: 'Drawing',
  text: 'Text',
  frame: 'Frame',
  image: 'Image',
};

export interface LibraryShapes {
  /** What goes in the item, in the order the board draws it. */
  readonly shapes: Shape[];
  /** Images among the selection, which an item cannot hold yet. */
  readonly imagesLeftOut: number;
}

/**
 * What adding the selection to the library keeps.
 *
 * A frame takes what stands in it, as moving or deleting it would. What the
 * board hides stays out: an item is what was on screen when it was made.
 * Images stay out too — their bytes belong to the board they were put on, and
 * a library item that drew a grey box on every other board is worse than one
 * without the picture.
 *
 * Everything that belongs to this board rather than to the drawing is let go:
 * the lock and the hiding, who last changed it, and any reference to a shape
 * that is not coming along. A frame and an arrow keep their hold on what came
 * with them.
 */
export function libraryShapesFor(
  selectedIds: readonly string[],
  board: readonly Shape[],
): LibraryShapes {
  const ids = new Set(withFrameMembers(selectedIds, board));
  const hidden = hiddenShapeIds(board);
  const picked = board.filter((shape) => ids.has(shape.id) && !hidden.has(shape.id));

  const kept = picked.filter((shape) => !isImage(shape));
  const keptIds = new Set(kept.map((shape) => shape.id));
  const held = (binding: ArrowBinding | null) =>
    binding && keptIds.has(binding.shapeId) ? binding : null;

  const shapes = kept.map((shape): Shape => {
    const {
      locked: _locked,
      hidden: _hidden,
      lastEditedBy: _by,
      lastEditedAt: _at,
      frameId,
      ...rest
    } = shape;
    const own = (
      frameId != null && keptIds.has(frameId) ? { ...rest, frameId } : { ...rest }
    ) as Shape;
    return isArrow(own)
      ? { ...own, startBinding: held(own.startBinding), endBinding: held(own.endBinding) }
      : own;
  });

  return { shapes, imagesLeftOut: picked.length - kept.length };
}

/**
 * A first name for an item, which the person can change: what its words say,
 * or what it is.
 *
 * A named frame names everything in it. Then the first line of text, then an
 * arrow's caption, then the kind of the one shape there is. A mix of unworded
 * shapes is counted.
 */
export function libraryItemName(shapes: readonly Shape[]): string {
  const named = (value: string) => {
    const line = value.split('\n').find((part) => part.trim() !== '') ?? '';
    const clean = line.trim().replace(/\s+/g, ' ');
    return clean.length > LIBRARY_NAME_MAX ? `${clean.slice(0, LIBRARY_NAME_MAX - 1)}…` : clean;
  };

  const frame = shapes.find((shape) => isFrame(shape) && shape.name.trim() !== '');
  if (frame && isFrame(frame)) return named(frame.name);

  for (const shape of shapes) {
    if (isText(shape) && shape.text.trim() !== '') return named(shape.text);
  }
  for (const shape of shapes) {
    if (isArrow(shape) && shape.label && shape.label.trim() !== '') return named(shape.label);
  }

  if (shapes.length === 1) return KIND_NAMES[shapes[0]!.kind];
  const kinds = new Set(shapes.map((shape) => shape.kind));
  if (kinds.size === 1 && shapes[0]) {
    return `${shapes.length} ${KIND_NAMES[shapes[0].kind].toLowerCase()}s`;
  }
  return `${shapes.length} shapes`;
}

export interface ReadLibraryShapes {
  readonly shapes: Shape[];
  /** Stored entries that could not be made into a shape. */
  readonly skipped: number;
}

/**
 * An item's shapes, rebuilt from what the gateway kept.
 *
 * The gateway checks only the outline of what it stores, so every entry goes
 * through the sanitizer a board file does, under a new id. A board file lets
 * go of arrow attachments; an item keeps them, since joined-up shapes are
 * much of what anyone keeps one for — but only to a shape of the same item,
 * found under its new id, with an anchor that says where on it.
 *
 * Which frame holds what is worked out again from where the shapes are.
 */
export function readLibraryShapes(
  stored: readonly unknown[],
  genId: () => string,
): ReadLibraryShapes {
  const rebuilt: { shape: Shape; raw: Record<string, unknown> }[] = [];
  const renamed = new Map<string, string>();
  let skipped = 0;

  for (const candidate of stored) {
    const shape = sanitizeShape(candidate, genId);
    if (!shape) {
      skipped += 1;
      continue;
    }
    const raw = candidate as Record<string, unknown>;
    if (typeof raw.id === 'string') renamed.set(raw.id, shape.id);
    rebuilt.push({ shape, raw });
  }

  const binding = (value: unknown): ArrowBinding | null => {
    if (typeof value !== 'object' || value === null) return null;
    const { shapeId, anchor, precise } = value as Record<string, unknown>;
    const target = typeof shapeId === 'string' ? renamed.get(shapeId) : undefined;
    if (!target || typeof anchor !== 'object' || anchor === null) return null;
    const { x, y } = anchor as Record<string, unknown>;
    if (!unit(x) || !unit(y)) return null;
    return { shapeId: target, anchor: { x, y }, precise: precise === true };
  };

  const shapes = rebuilt.map(({ shape, raw }) =>
    isArrow(shape)
      ? { ...shape, startBinding: binding(raw.startBinding), endBinding: binding(raw.endBinding) }
      : shape,
  );

  const frames = framesIn(shapes);
  if (frames.length === 0) return { shapes, skipped };
  return {
    shapes: shapes.map((shape) => {
      const frameId = frameForShape(shape, frames);
      return frameId ? { ...shape, frameId } : shape;
    }),
    skipped,
  };
}

function unit(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * A picture of an item for its tile, drawn the way an SVG export draws it:
 * the same shapes, in the board's dark or light. Null when it cannot be drawn,
 * which leaves the tile showing its name alone.
 */
export function libraryThumbnail(shapes: readonly Shape[], darkMode: boolean): string | null {
  if (shapes.length === 0) return null;
  try {
    const svg = renderSceneToSvgString(shapes, { darkMode, padding: 8 });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}
