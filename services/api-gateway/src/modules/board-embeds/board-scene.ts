import * as Y from 'yjs';
import { mergeSnapshots } from '../board-export/merge-snapshots.js';

/**
 * What an embedded board shows: its shapes, and nothing else in its document.
 *
 * The board's document holds more than its drawing — its comment threads live
 * beside the shapes, and each shape says who last changed it. An embed is seen
 * by anyone on the page it sits in, so this copies out what is drawn and
 * leaves the rest behind, rather than handing over the document and trusting
 * the viewer not to read it. A field or a top-level part added to the document
 * later stays private until somebody adds it here.
 */

/** Plain shapes, as the document stores them, for the editor to read back. */
export type SceneShape = Record<string, unknown>;

export interface BoardScene {
  shapes: SceneShape[];
  /** Board images the scene draws, by content hash: the only ones an embed may fetch. */
  imageIds: ReadonlySet<string>;
  /** Link-preview pictures it draws — cards' and embeds' stills — by object name. */
  previewNames: ReadonlySet<string>;
}

/** Who changed a shape and when: about the board's people, not its drawing. */
const PRIVATE_FIELDS = ['lastEditedBy', 'lastEditedAt'] as const;

const IMAGE_ID = /^[0-9a-f]{64}$/;
const PREVIEW_NAME = /^[0-9a-f]{64}\.(png|jpg|gif|webp)$/;

/** Frames nest only so deep; a longer chain is a loop someone wrote, not a board. */
const MAX_FRAME_DEPTH = 64;

/**
 * The shapes nobody sees: hidden themselves, or standing in a hidden frame at
 * any depth — the same rule the editor draws by.
 */
function hiddenIds(shapes: readonly SceneShape[]): Set<string> {
  const byId = new Map<string, SceneShape>();
  for (const shape of shapes) if (typeof shape.id === 'string') byId.set(shape.id, shape);

  const hidden = new Set<string>();
  for (const [id, shape] of byId) {
    let current: SceneShape | undefined = shape;
    const seen = new Set<string>();
    for (let depth = 0; current && depth <= MAX_FRAME_DEPTH; depth++) {
      if (current.hidden === true) {
        hidden.add(id);
        break;
      }
      const frameId: unknown = current.frameId;
      if (typeof frameId !== 'string' || seen.has(frameId)) break;
      seen.add(frameId);
      current = byId.get(frameId);
    }
  }
  return hidden;
}

/** The scene of a board from its saved snapshots; empty for a board never drawn on. */
export function boardScene(snapshots: readonly Uint8Array[]): BoardScene {
  const merged = mergeSnapshots(snapshots);
  const empty: BoardScene = { shapes: [], imageIds: new Set(), previewNames: new Set() };
  if (!merged) return empty;

  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, merged);
    const stored = doc
      .getArray<unknown>('shapes')
      .toArray()
      .filter((item): item is Y.Map<unknown> => item instanceof Y.Map)
      .map((map) => map.toJSON() as SceneShape);

    const hidden = hiddenIds(stored);
    const shapes: SceneShape[] = [];
    const imageIds = new Set<string>();
    const previewNames = new Set<string>();
    for (const shape of stored) {
      if (typeof shape.id !== 'string' || hidden.has(shape.id)) continue;
      for (const field of PRIVATE_FIELDS) delete shape[field];
      shapes.push(shape);

      if (
        shape.kind === 'image' &&
        typeof shape.fileId === 'string' &&
        IMAGE_ID.test(shape.fileId)
      ) {
        imageIds.add(shape.fileId);
      }
      const picture =
        shape.kind === 'bookmark' ? shape.image : shape.kind === 'embed' ? shape.poster : null;
      if (typeof picture === 'string' && PREVIEW_NAME.test(picture)) previewNames.add(picture);
    }
    return { shapes, imageIds, previewNames };
  } finally {
    doc.destroy();
  }
}
