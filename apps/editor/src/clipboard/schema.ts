import type { Shape } from '@canvasflow/canvas-engine';

/**
 * Our clipboard payload format. Serialized as JSON, written to system
 * clipboard as text. On paste, we detect this marker to distinguish our
 * own data from arbitrary text or Excalidraw's format.
 */
export interface CanvasFlowClipboard {
  type: 'canvasflow/clipboard';
  version: 1;
  shapes: Shape[];
}

/**
 * Excalidraw's clipboard format. We accept it on paste.
 * Fields we don't use are typed loose; we extract only what we need.
 */
export interface ExcalidrawClipboard {
  type: 'excalidraw/clipboard';
  elements: ExcalidrawElement[];
}

export interface ExcalidrawElement {
  id: string;
  type: string; // 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'freedraw' | 'text' | 'image' | ...
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  points?: Array<[number, number]>;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  text?: string;
  fontSize?: number;
  fontFamily?: number; // Excalidraw uses numeric IDs — we translate below
  seed?: number;
}

export function isCanvasFlowClipboard(x: unknown): x is CanvasFlowClipboard {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  return obj.type === 'canvasflow/clipboard' && Array.isArray(obj.shapes);
}

export function isExcalidrawClipboard(x: unknown): x is ExcalidrawClipboard {
  if (typeof x !== 'object' || x === null) return false;
  const obj = x as Record<string, unknown>;
  return obj.type === 'excalidraw/clipboard' && Array.isArray(obj.elements);
}
