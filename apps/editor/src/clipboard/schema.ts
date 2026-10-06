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

/**
 * An element as an Excalidraw clipboard or library file holds it — only the
 * fields this editor reads. Everything is optional past the type and the
 * position, and nothing is trusted: these come from outside.
 */
export interface ExcalidrawElement {
  id: string;
  type: string; // 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'freedraw' | 'text' | 'frame' | 'image' | ...
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  strokeStyle?: string;
  roughness?: number;
  opacity?: number;
  seed?: number;
  roundness?: { type?: number } | null;
  isDeleted?: boolean;
  points?: Array<[number, number]>;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  startBinding?: { elementId?: string; fixedPoint?: [number, number] | null } | null;
  endBinding?: { elementId?: string; fixedPoint?: [number, number] | null } | null;
  elbowed?: boolean;
  simulatePressure?: boolean;
  text?: string;
  originalText?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  containerId?: string | null;
  name?: string | null;
  link?: string | null;
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
