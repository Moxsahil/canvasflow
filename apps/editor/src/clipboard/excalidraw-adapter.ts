import {
  createArrow,
  createDiamond,
  createEllipse,
  createFreehand,
  createLine,
  createRectangle,
  createText,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { ExcalidrawElement } from './schema';

/**
 * Excalidraw uses numeric IDs for font families in their JSON:
 *   1 = Virgil (their handwritten default)
 *   2 = Helvetica
 *   3 = Cascadia
 *   4 = Segoe UI
 * We map them to font-family strings that fit our stack.
 */
const EXCALIDRAW_FONT_MAP: Record<number, string> = {
  1: '"Caveat", "Comic Sans MS", system-ui, sans-serif',
  2: 'Helvetica, Arial, sans-serif',
  3: '"Cascadia Code", "Cascadia Mono", monospace',
  4: '"Segoe UI", system-ui, sans-serif',
};

/**
 * Convert a list of Excalidraw elements into CanvasFlow shapes.
 * Skips unsupported types (image, frame, etc.) silently.
 * Uses caller-provided genId so we don't collide with existing shape IDs.
 */
export function excalidrawElementsToShapes(
  elements: ExcalidrawElement[],
  genId: () => string,
): Shape[] {
  const shapes: Shape[] = [];
  for (const el of elements) {
    const shape = elementToShape(el, genId);
    if (shape) shapes.push(shape);
  }
  return shapes;
}

function elementToShape(el: ExcalidrawElement, genId: () => string): Shape | null {
  const common = {
    id: genId(),
    strokeColor: el.strokeColor ?? '#1e293b',
    fillColor:
      el.backgroundColor && el.backgroundColor !== 'transparent' ? el.backgroundColor : null,
    strokeWidth: el.strokeWidth ?? 2,
    rotation: el.angle ?? 0,
    seed: el.seed ?? Math.floor(Math.random() * 2 ** 31),
  };

  switch (el.type) {
    case 'rectangle':
      return createRectangle({
        ...common,
        x: el.x,
        y: el.y,
        width: el.width ?? 100,
        height: el.height ?? 50,
      });

    case 'ellipse':
      return createEllipse({
        ...common,
        x: el.x,
        y: el.y,
        width: el.width ?? 100,
        height: el.height ?? 50,
      });

    case 'diamond':
      return createDiamond({
        ...common,
        x: el.x,
        y: el.y,
        width: el.width ?? 100,
        height: el.height ?? 100,
      });

    case 'line': {
      const points: Array<[number, number]> =
        el.points && el.points.length >= 2
          ? el.points
          : [
              [0, 0],
              [100, 0],
            ];
      return createLine({
        ...common,
        x: el.x,
        y: el.y,
        points,
      });
    }

    case 'arrow': {
      const points: Array<[number, number]> =
        el.points && el.points.length >= 2
          ? el.points
          : [
              [0, 0],
              [100, 0],
            ];
      return createArrow({
        ...common,
        x: el.x,
        y: el.y,
        points,
        startArrowhead: el.startArrowhead === 'triangle' ? 'triangle' : 'none',
        endArrowhead:
          el.endArrowhead === 'triangle'
            ? 'triangle'
            : el.endArrowhead === null
              ? 'none'
              : 'triangle',
      });
    }

    case 'freedraw': {
      const points: Array<[number, number]> =
        el.points && el.points.length >= 2 ? el.points : [[0, 0]];
      return createFreehand({
        ...common,
        x: el.x,
        y: el.y,
        points,
      });
    }

    case 'text': {
      const fontFamily =
        typeof el.fontFamily === 'number'
          ? (EXCALIDRAW_FONT_MAP[el.fontFamily] ?? EXCALIDRAW_FONT_MAP[1]!)
          : EXCALIDRAW_FONT_MAP[1]!;
      return createText({
        ...common,
        x: el.x,
        y: el.y,
        text: el.text ?? '',
        fontSize: el.fontSize ?? 20,
        fontFamily,
      });
    }

    // Skip unsupported types: image, frame, embed, etc.
    default:
      return null;
  }
}
