import type { Shape } from '@canvasflow/canvas-engine';

/**
 * Where the shapes being dragged are drawn, ahead of the document.
 *
 * Every write to the document re-renders the whole editor, which is far more
 * work than a frame has room for. So a drag draws its shapes from here, which
 * only the canvases listen to, and writes the document now and then for the
 * people watching and once more on release.
 */
export interface DragPreview {
  get(): ReadonlyMap<string, Partial<Shape>> | null;
  set(next: ReadonlyMap<string, Partial<Shape>> | null): void;
  subscribe(listener: () => void): () => void;
}

export function createDragPreview(): DragPreview {
  let shown: ReadonlyMap<string, Partial<Shape>> | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => shown,
    set(next) {
      if (next === shown) return;
      shown = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The board as drawn: each shape a drag has ahead of the document moved there. */
export function withDragPreview(
  shapes: readonly Shape[],
  preview: ReadonlyMap<string, Partial<Shape>> | null,
): readonly Shape[] {
  if (!preview || preview.size === 0) return shapes;
  return shapes.map((shape) => {
    const moved = preview.get(shape.id);
    return moved ? ({ ...shape, ...moved } as Shape) : shape;
  });
}
