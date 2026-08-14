import type { Shape } from '@canvasflow/canvas-engine';

export interface CanvasFlowClipboard {
  type: 'canvasflow/clipboard';
  version: 1;
  shapes: Shape[];
}

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
  fontFamily?: number;
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
