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

  constructor(doc?: Y.Doc) {
    this.yDoc = doc ?? new Y.Doc();
    this.yShapes = this.yDoc.getArray<Y.Map<unknown>>('shapes');

    // UndoManager tracks changes to the shapes array only.
    // - captureTimeout groups rapid activity into single undo steps
    // - trackedOrigins limits what gets tracked; we skip 'remote' origin
    //   updates so my undo doesn't undo someone else's changes (Sprint 3)
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

  /**
   * Subscribe to undo/redo availability changes. Fires whenever the
   * undo or redo stack changes size, so UI can re-check canUndo/canRedo.
   */
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
   * Manually mark the end of an undo group.
   * Call this after finishing a drag/resize gesture so the NEXT gesture
   * starts a new undo step, even if it happens within captureTimeout.
   */
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

  private getMaxZIndex(): string | null {
    let max: string | null = null;
    for (let i = 0; i < this.yShapes.length; i++) {
      const z = this.yShapes.get(i).get('zIndex');
      if (typeof z === 'string') {
        if (max === null || z > max) max = z;
      }
    }
    return max;
  }

  addShape(shape: Shape): void {
    this.yDoc.transact(() => {
      const currentMax = this.getMaxZIndex();
      const newZIndex = generateKeyBetween(currentMax, null);
      const shapeWithZ = { ...shape, zIndex: newZIndex } as Shape & { zIndex: string };
      this.yShapes.push([shapeToYMap(shapeWithZ)]);
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
