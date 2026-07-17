import * as Y from 'yjs';
import { generateKeyBetween } from 'fractional-indexing';
import type { Shape } from '../shapes/shape.js';
import { shapeToYMap, yMapToShape } from './yjs-shape.js';

/**
 * The canonical document API for CanvasFlow boards.
 *
 * Wraps a Y.Doc containing a single Y.Array<Y.Map> called 'shapes'.
 * All shape mutations go through methods on this class so we can:
 *   - Enforce fractional indexing consistency
 *   - Emit change notifications for React
 *   - Centralize the Y.Doc <-> Shape[] conversion
 *
 * The Y.Doc is exposed via .yDoc for the sync layer (Phase C) that
 * needs raw Yjs update bytes.
 */
export class BoardDocument {
  readonly yDoc: Y.Doc;
  private readonly yShapes: Y.Array<Y.Map<unknown>>;
  private listeners = new Set<() => void>();

  constructor(doc?: Y.Doc) {
    this.yDoc = doc ?? new Y.Doc();
    this.yShapes = this.yDoc.getArray<Y.Map<unknown>>('shapes');

    // Notify listeners on any deep change to the shapes array
    this.yShapes.observeDeep(() => {
      for (const listener of this.listeners) listener();
    });
  }

  /**
   * Subscribe to any change in the document. Returns unsubscribe fn.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Read all shapes as plain objects, sorted by zIndex for render order.
   */
  getShapes(): Shape[] {
    const shapes: Shape[] = [];
    for (let i = 0; i < this.yShapes.length; i++) {
      const yMap = this.yShapes.get(i);
      const shape = yMapToShape(yMap);
      if (shape) shapes.push(shape);
    }
    // Sort by zIndex string ascending. Fallback to insertion order if any
    // shape lacks a zIndex (shouldn't happen in normal flow but be safe).
    return shapes.sort((a, b) => {
      const az = (a as Shape & { zIndex?: string }).zIndex ?? '';
      const bz = (b as Shape & { zIndex?: string }).zIndex ?? '';
      return az.localeCompare(bz);
    });
  }

  /**
   * Get the current highest zIndex string, or null if no shapes exist.
   * Used to generate a new zIndex for shapes added at the top.
   */
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

  /**
   * Add a new shape. Automatically assigns it a zIndex above all existing
   * shapes (so it renders on top).
   */
  addShape(shape: Shape): void {
    this.yDoc.transact(() => {
      const currentMax = this.getMaxZIndex();
      const newZIndex = generateKeyBetween(currentMax, null);
      const shapeWithZ = { ...shape, zIndex: newZIndex } as Shape & { zIndex: string };
      this.yShapes.push([shapeToYMap(shapeWithZ)]);
    });
  }

  /**
   * Update a shape by id. Applies each provided property to the Y.Map.
   * Untouched properties are left alone. Fine-grained sync: each property
   * change is a separate Yjs update, so two users editing different
   * properties of the same shape don't conflict.
   */
  updateShape(id: string, patch: Partial<Shape>): void {
    this.yDoc.transact(() => {
      for (let i = 0; i < this.yShapes.length; i++) {
        const yMap = this.yShapes.get(i);
        if (yMap.get('id') === id) {
          for (const [key, value] of Object.entries(patch)) {
            if (key === 'id' || key === 'kind') continue; // never change identity
            yMap.set(key, value);
          }
          return;
        }
      }
    });
  }

  /**
   * Delete one or more shapes by id.
   */
  deleteShapes(ids: readonly string[]): void {
    const idSet = new Set(ids);
    this.yDoc.transact(() => {
      // Iterate in reverse so index-based deletions don't shift subsequent indices
      for (let i = this.yShapes.length - 1; i >= 0; i--) {
        const yMap = this.yShapes.get(i);
        if (idSet.has(yMap.get('id') as string)) {
          this.yShapes.delete(i, 1);
        }
      }
    });
  }

  /**
   * Bring shape to front — give it a zIndex above all others.
   */
  bringToFront(id: string): void {
    this.yDoc.transact(() => {
      const currentMax = this.getMaxZIndex();
      const newZIndex = generateKeyBetween(currentMax, null);
      this.updateShape(id, { zIndex: newZIndex } as unknown as Partial<Shape>);
    });
  }

  /**
   * Send shape to back — give it a zIndex below all others.
   */
  sendToBack(id: string): void {
    this.yDoc.transact(() => {
      let currentMin: string | null = null;
      for (let i = 0; i < this.yShapes.length; i++) {
        const z = this.yShapes.get(i).get('zIndex');
        if (typeof z === 'string' && z !== this.yShapes.get(i).get('zIndex-none')) {
          const yMapId = this.yShapes.get(i).get('id');
          if (yMapId === id) continue; // exclude the shape being moved
          if (currentMin === null || z < currentMin) currentMin = z;
        }
      }
      const newZIndex = generateKeyBetween(null, currentMin);
      this.updateShape(id, { zIndex: newZIndex } as unknown as Partial<Shape>);
    });
  }

  /**
   * Apply a raw Yjs update. Used by the sync layer to hydrate a doc from
   * the server's update log.
   */
  applyUpdate(update: Uint8Array): void {
    Y.applyUpdate(this.yDoc, update);
  }

  /**
   * Encode the current state as a single Yjs update. Used for snapshots.
   */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.yDoc);
  }

  /**
   * Destroy the doc — call on unmount to prevent memory leaks.
   */
  destroy(): void {
    this.listeners.clear();
    this.yDoc.destroy();
  }
}
