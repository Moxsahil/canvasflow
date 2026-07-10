import RBush from 'rbush';
import type { Shape } from '../shapes/shape.js';
import { shapeBounds } from '../shapes/bounds.js';
import type { Rect } from '../math.js';

interface IndexedShape {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

export class SpatialIndex {
  private tree: RBush<IndexedShape>;

  constructor() {
    this.tree = new RBush<IndexedShape>();
  }

  rebuild(shapes: readonly Shape[]): void {
    this.tree.clear();
    const items: IndexedShape[] = shapes.map((s) => {
      const b = shapeBounds(s);
      return {
        minX: b.x,
        minY: b.y,
        maxX: b.x + b.width,
        maxY: b.y + b.height,
        id: s.id,
      };
    });
    this.tree.load(items);
  }

  /** All shape IDs whose bounds intersect the rect. */
  searchRect(rect: Rect): string[] {
    const results = this.tree.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
    });
    return results.map((r) => r.id);
  }

  /** All shape IDs whose bounds contain the point. */

  searchPoint(x: number, y: number): string[] {
    return this.searchRect({ x, y, width: 0, height: 0 });
  }
}
