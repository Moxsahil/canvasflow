import type { Shape } from '@canvasflow/canvas-engine';
import { isCanvasFlowClipboard, isExcalidrawClipboard, type CanvasFlowClipboard } from './schema';
import { excalidrawElementsToShapes } from './excalidraw-adapter';

/**
 * Serialize shapes into our clipboard JSON format and write to system clipboard.
 *
 * Falls back to console.error if the browser blocks clipboard access.
 * Returns true on success, false on failure (silent — no modal).
 */
export async function writeShapesToClipboard(shapes: readonly Shape[]): Promise<boolean> {
  if (shapes.length === 0) return false;

  const payload: CanvasFlowClipboard = {
    type: 'canvasflow/clipboard',
    version: 1,
    shapes: [...shapes],
  };

  try {
    await navigator.clipboard.writeText(JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('Clipboard write failed:', err);
    return false;
  }
}

export async function readShapesFromClipboard(genId: () => string): Promise<Shape[]> {
  let raw: string;
  try {
    raw = await navigator.clipboard.readText();
  } catch (err) {
    console.error('Clipboard read failed:', err);
    return [];
  }

  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON — not our data
    return [];
  }

  if (isCanvasFlowClipboard(parsed)) {
    // Reassign IDs so pasted shapes never collide with existing ones
    return parsed.shapes.map((s) => ({ ...s, id: genId() }));
  }

  if (isExcalidrawClipboard(parsed)) {
    return excalidrawElementsToShapes(parsed.elements, genId);
  }

  return [];
}
