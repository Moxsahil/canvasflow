import * as Y from 'yjs';
import { generateKeyBetween } from 'fractional-indexing';
import type { Shape } from '../shapes/shape.js';
import { shapeToYMap, yMapToShape } from './yjs-shape.js';

const UNDO_CAPTURE_TIMEOUT_MS = 1000;

/**
 * The canonical document API for CanvasFlow boards.
 *
 * Wraps a Y.Doc containing a single Y.Array<Y.Map> called 'shapes'.
 * All shape mutations go through methods on this class so we can:
 *   - Enforce fractional indexing consistency
 *   - Emit change notifications for React
 *   - Provide undo/redo via Y.UndoManager
 *   - Centralize the Y.Doc <-> Shape[] conversion
 */
export class BoardDocument {
  readonly yDoc: Y.Doc;
  private readonly yShapes: Y.Array<Y.Map<unknown>>;
  private readonly undoManager: Y.UndoManager;
  private listeners = new Set<() => void>();
  private undoListeners = new Set<() => void>();
  private userId: string | null = null;

  constructor(doc?: Y.Doc, userId?: string | null) {
    this.yDoc = doc ?? new Y.Doc();
    this.yShapes = this.yDoc.getArray<Y.Map<unknown>>('shapes');
    this.userId = userId ?? null;

    this.undoManager = new Y.UndoManager(this.yShapes, {
      captureTimeout: UNDO_CAPTURE_TIMEOUT_MS,
      trackedOrigins: new Set([null, undefined, 'local']),
    });

    // Notify listeners on any deep change to the shapes array
    this.yShapes.observeDeep(() => {
      for (const listener of this.listeners) listener();
    });

    // Notify undo listeners when undo/redo state changes
    const notifyUndo = () => {
      for (const listener of this.undoListeners) listener();
    };
    this.undoManager.on('stack-item-added', notifyUndo);
    this.undoManager.on('stack-item-popped', notifyUndo);
    this.undoManager.on('stack-cleared', notifyUndo);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onUndoChange(listener: () => void): () => void {
    this.undoListeners.add(listener);
    return () => this.undoListeners.delete(listener);
  }

  canUndo(): boolean {
    return this.undoManager.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.undoManager.redoStack.length > 0;
  }

  undo(): void {
    this.undoManager.undo();
  }

  redo(): void {
    this.undoManager.redo();
  }

  /**
   * An opaque handle to the edit that the next undo would revert (and, for
   * `peekRedoItem`, the next redo).
   *
   * These exist so a caller can pair state of its own with one specific edit —
   * the editor uses them to put the camera back when an opened file is undone,
   * since that action moved the viewport as well as the document. Identity is
   * the whole point: a handle only ever matches the edit it came from, so a
   * later edit can't be mistaken for it.
   */
  peekUndoItem(): object | null {
    return this.undoManager.undoStack[this.undoManager.undoStack.length - 1] ?? null;
  }

  peekRedoItem(): object | null {
    return this.undoManager.redoStack[this.undoManager.redoStack.length - 1] ?? null;
  }

  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  private setAttribution(yMap: Y.Map<unknown>): void {
    if (this.userId === null) return;
    yMap.set('lastEditedBy', this.userId);
    yMap.set('lastEditedAt', Date.now());
  }

  breakUndoGroup(): void {
    this.undoManager.stopCapturing();
  }

  getShapes(): Shape[] {
    const shapes: Shape[] = [];
    for (let i = 0; i < this.yShapes.length; i++) {
      const yMap = this.yShapes.get(i);
      const shape = yMapToShape(yMap);
      if (shape) shapes.push(shape);
    }
    return shapes.sort((a, b) => {
      const az = (a as Shape & { zIndex?: string }).zIndex ?? '';
      const bz = (b as Shape & { zIndex?: string }).zIndex ?? '';
      return az.localeCompare(bz);
    });
  }

  /**
   * Get all zIndex strings currently in use, sorted ascending.
   * Used by layer-order methods to find neighbors.
   */
  private getSortedZIndexes(): Array<{ id: string; zIndex: string }> {
    const items: Array<{ id: string; zIndex: string }> = [];
    for (let i = 0; i < this.yShapes.length; i++) {
      const yMap = this.yShapes.get(i);
      const id = yMap.get('id') as string;
      const z = yMap.get('zIndex');
      if (typeof z === 'string') {
        items.push({ id, zIndex: z });
      }
    }
    return items.sort((a, b) => a.zIndex.localeCompare(b.zIndex));
  }

  private getMaxZIndex(): string | null {
    const sorted = this.getSortedZIndexes();
    return sorted.length > 0 ? sorted[sorted.length - 1]!.zIndex : null;
  }

  addShape(shape: Shape): void {
    this.yDoc.transact(() => {
      const currentMax = this.getMaxZIndex();
      const newZIndex = generateKeyBetween(currentMax, null);
      const shapeWithZ = { ...shape, zIndex: newZIndex } as Shape & { zIndex: string };
      const yMap = shapeToYMap(shapeWithZ);
      this.setAttribution(yMap);
      this.yShapes.push([yMap]);
    }, 'local');
  }

  /**
   * Swap the board's entire contents — the file-open path.
   *
   * One transact, so it lands as a single undo step and a single sync update:
   * a collaborator sees the board change once, rather than watching the old
   * shapes vanish one by one and the new ones arrive after. zIndexes are
   * regenerated in array order, so the file's stacking order is what shows.
   */
  replaceShapes(shapes: readonly Shape[]): void {
    this.yDoc.transact(() => {
      if (this.yShapes.length > 0) {
        this.yShapes.delete(0, this.yShapes.length);
      }
      let zIndex: string | null = null;
      for (const shape of shapes) {
        zIndex = generateKeyBetween(zIndex, null);
        const yMap = shapeToYMap({ ...shape, zIndex } as Shape & { zIndex: string });
        this.setAttribution(yMap);
        this.yShapes.push([yMap]);
      }
    }, 'local');
  }

  updateShape(id: string, patch: Partial<Shape>): void {
    this.yDoc.transact(() => {
      for (let i = 0; i < this.yShapes.length; i++) {
        const yMap = this.yShapes.get(i);
        if (yMap.get('id') === id) {
          for (const [key, value] of Object.entries(patch)) {
            if (key === 'id' || key === 'kind') continue;
            yMap.set(key, value);
          }
          this.setAttribution(yMap);
          return;
        }
      }
    }, 'local');
  }

  deleteShapes(ids: readonly string[]): void {
    const idSet = new Set(ids);
    this.yDoc.transact(() => {
      for (let i = this.yShapes.length - 1; i >= 0; i--) {
        const yMap = this.yShapes.get(i);
        if (idSet.has(yMap.get('id') as string)) {
          this.yShapes.delete(i, 1);
        }
      }
    }, 'local');
  }

  bringToFront(id: string): void {
    this.yDoc.transact(() => {
      const currentMax = this.getMaxZIndex();
      const newZIndex = generateKeyBetween(currentMax, null);
      this.updateShape(id, { zIndex: newZIndex } as unknown as Partial<Shape>);
    }, 'local');
  }

  sendToBack(id: string): void {
    this.yDoc.transact(() => {
      let currentMin: string | null = null;
      for (let i = 0; i < this.yShapes.length; i++) {
        const yMap = this.yShapes.get(i);
        if (yMap.get('id') === id) continue;
        const z = yMap.get('zIndex');
        if (typeof z === 'string' && (currentMin === null || z < currentMin)) {
          currentMin = z;
        }
      }
      const newZIndex = generateKeyBetween(null, currentMin);
      this.updateShape(id, { zIndex: newZIndex } as unknown as Partial<Shape>);
    }, 'local');
  }

  /**
   * Move the shape one layer forward (up in z-order).
   * If already at the top, no-op.
   */
  bringForward(id: string): void {
    this.yDoc.transact(() => {
      const sorted = this.getSortedZIndexes();
      const currentIdx = sorted.findIndex((s) => s.id === id);
      if (currentIdx === -1 || currentIdx === sorted.length - 1) return;

      // Get the shape currently above us and the one above that
      const above = sorted[currentIdx + 1]!;
      const aboveAbove = sorted[currentIdx + 2]?.zIndex ?? null;

      // Insert between the one above us and the one above that
      const newZIndex = generateKeyBetween(above.zIndex, aboveAbove);
      this.updateShape(id, { zIndex: newZIndex } as unknown as Partial<Shape>);
    }, 'local');
  }

  /**
   * Move the shape one layer backward (down in z-order).
   * If already at the bottom, no-op.
   */
  sendBackward(id: string): void {
    this.yDoc.transact(() => {
      const sorted = this.getSortedZIndexes();
      const currentIdx = sorted.findIndex((s) => s.id === id);
      if (currentIdx === -1 || currentIdx === 0) return;

      // Get the shape currently below us and the one below that
      const below = sorted[currentIdx - 1]!;
      const belowBelow = sorted[currentIdx - 2]?.zIndex ?? null;

      // Insert between the one below us and the one below that
      const newZIndex = generateKeyBetween(belowBelow, below.zIndex);
      this.updateShape(id, { zIndex: newZIndex } as unknown as Partial<Shape>);
    }, 'local');
  }

  /**
   * Batch-nudge multiple shapes by a delta.
   * Wrapped in a single transact so it's one undo step.
   */
  nudgeShapes(ids: readonly string[], dx: number, dy: number): void {
    if (ids.length === 0 || (dx === 0 && dy === 0)) return;
    const idSet = new Set(ids);
    this.yDoc.transact(() => {
      for (let i = 0; i < this.yShapes.length; i++) {
        const yMap = this.yShapes.get(i);
        const id = yMap.get('id') as string;
        if (!idSet.has(id)) continue;
        const x = yMap.get('x') as number;
        const y = yMap.get('y') as number;
        yMap.set('x', x + dx);
        yMap.set('y', y + dy);
        this.setAttribution(yMap);
      }
    }, 'local');
    this.breakUndoGroup();
  }

  /**
   * Duplicate a set of shapes with a positional offset. Returns the new
   * shape IDs so the caller can select them.
   *
   * All duplicates share one transact = one undo step.
   */
  duplicateShapes(
    ids: readonly string[],
    offset: { dx: number; dy: number },
    genId: () => string,
  ): string[] {
    const idSet = new Set(ids);
    const originals: Array<{ yMap: Y.Map<unknown>; newId: string }> = [];

    // First pass: collect the originals + generate new IDs
    for (let i = 0; i < this.yShapes.length; i++) {
      const yMap = this.yShapes.get(i);
      if (idSet.has(yMap.get('id') as string)) {
        originals.push({ yMap, newId: genId() });
      }
    }

    if (originals.length === 0) return [];

    this.yDoc.transact(() => {
      let currentMax = this.getMaxZIndex();
      for (const { yMap, newId } of originals) {
        // Clone every property from the original Y.Map into a new one
        const clone = new Y.Map<unknown>();
        yMap.forEach((value, key) => {
          if (key === 'id') return; // will set new id below
          if (key === 'x') {
            clone.set('x', (value as number) + offset.dx);
          } else if (key === 'y') {
            clone.set('y', (value as number) + offset.dy);
          } else {
            clone.set(key, value);
          }
        });
        clone.set('id', newId);

        // Give the clone a fresh zIndex above current max
        const newZIndex = generateKeyBetween(currentMax, null);
        clone.set('zIndex', newZIndex);
        currentMax = newZIndex;
        this.setAttribution(clone);

        this.yShapes.push([clone]);
      }
    }, 'local');

    return originals.map((o) => o.newId);
  }

  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.yDoc, update);
  }

  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.yDoc);
  }

  destroy(): void {
    this.listeners.clear();
    this.undoListeners.clear();
    this.undoManager.destroy();
    this.yDoc.destroy();
  }
}
