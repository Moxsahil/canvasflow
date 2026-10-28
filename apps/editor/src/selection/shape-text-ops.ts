import {
  createRectangle,
  createText,
  fitShapeToText,
  isArrow,
  isText,
  isTextContainer,
  shapeScale,
  shapeTextFont,
  shapeTextLayout,
  shapeTextOf,
  textBoundsEstimate,
  type ArrowShape,
  type RectangleShape,
  type Shape,
  type ShapeUpdate,
  type TextContainerShape,
  type TextShape,
} from '@canvasflow/canvas-engine';
import type { ItemStyle } from '../machine/tool-machine.types';

/**
 * Moving words between a text shape and a shape that can hold them — the three
 * Edit rows of the context menu. Each answers with what to write rather than
 * writing it, so the editor can make each one a single undo step.
 */

/** Room left around text that a new box is drawn to fit, at 1:1. */
const WRAP_PADDING = 16;

/** The size a text shape's words come out at in a shape of another scale. */
function sizeIn(target: { scale?: number }, text: TextShape): number {
  return (text.fontSize * shapeScale(text)) / shapeScale(target);
}

/**
 * A text shape and a shape with no words of its own, which are all that is
 * selected: the pair Bind text to container takes. Null for anything else.
 */
export function bindablePair(
  selected: readonly Shape[],
): { text: TextShape; container: TextContainerShape } | null {
  if (selected.length !== 2) return null;
  const text = selected.find(isText);
  const container = selected.find(isTextContainer);
  if (!text || !container || shapeTextOf(container) !== '') return null;
  return { text, container };
}

/**
 * Bind text to container: the text becomes the shape's own words, centred in
 * it, at the size it was drawn at, and the text shape goes. The shape grows if
 * the words need more room than it has.
 */
export function bindTextToShape(
  text: TextShape,
  container: TextContainerShape,
): { container: TextContainerShape; removeId: string } {
  return {
    container: fitShapeToText({
      ...container,
      label: text.text,
      fontSize: sizeIn(container, text),
      fontFamily: text.fontFamily,
      textAlign: 'center',
    }),
    removeId: text.id,
  };
}

/** The selected shapes that have words of their own: what Unbind text takes. */
export function unbindableShapes(selected: readonly Shape[]): TextContainerShape[] {
  return selected.filter(
    (shape): shape is TextContainerShape => isTextContainer(shape) && shapeTextOf(shape) !== '',
  );
}

/**
 * Unbind text: the shape's words become a text shape of their own, where they
 * were drawn and as they looked, and the shape is left without words. The text
 * keeps its own line breaks rather than the ones the shape wrapped it at.
 */
export function unbindTextFromShape(
  container: TextContainerShape,
  id: string,
): { text: TextShape; containerPatch: Partial<Shape> } | null {
  const layout = shapeTextLayout(container);
  if (!layout) return null;
  const words = shapeTextOf(container);
  const { fontSize: drawnSize, fontFamily, textAlign } = shapeTextFont(container);
  const lines = words.split('\n').length;
  const height = (lines - 1) * drawnSize * 1.2 + drawnSize;

  const text = createText({
    id,
    x: layout.x,
    // Centred where the wrapped words were, now that it may have fewer lines.
    y: layout.textTop + (layout.height - height) / 2,
    text: words,
    fontSize: drawnSize / shapeScale(container),
    fontFamily,
    textAlign,
    strokeColor: container.strokeColor,
    opacity: container.opacity,
    ...(container.scale !== undefined && { scale: container.scale }),
  });
  return {
    text: container.frameId != null ? { ...text, frameId: container.frameId } : text,
    containerPatch: { label: '' },
  };
}

/** The selected text shapes: what Wrap text in container takes. */
export function wrappableTexts(selected: readonly Shape[]): TextShape[] {
  return selected.filter(isText);
}

/**
 * Wrap text in container: a box drawn round the text, in the style the panel
 * is showing, with the text as its words. Arrows attached to the text are
 * attached to the box instead, as they would have been had it been there all
 * along.
 */
export function wrapTextInShape(
  text: TextShape,
  id: string,
  style: ItemStyle,
  board: readonly Shape[],
): { container: RectangleShape; removeId: string; arrows: ShapeUpdate[] } {
  const bounds = textBoundsEstimate(text);
  const pad = WRAP_PADDING * shapeScale(text);
  const box = createRectangle({
    id,
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: bounds.width + pad * 2,
    height: bounds.height + pad * 2,
    strokeColor: style.strokeColor,
    fillColor: style.fillColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    edges: style.edges,
    opacity: text.opacity,
    ...(text.scale !== undefined && { scale: text.scale }),
    label: text.text,
    fontSize: text.fontSize,
    fontFamily: text.fontFamily,
    textAlign: 'center',
  });
  const container = fitShapeToText(text.frameId != null ? { ...box, frameId: text.frameId } : box);

  const arrows: ShapeUpdate[] = board
    .filter(isArrow)
    .filter(
      (arrow) => arrow.startBinding?.shapeId === text.id || arrow.endBinding?.shapeId === text.id,
    )
    .map((arrow: ArrowShape) => ({
      id: arrow.id,
      patch: {
        startBinding:
          arrow.startBinding?.shapeId === text.id
            ? { ...arrow.startBinding, shapeId: id }
            : arrow.startBinding,
        endBinding:
          arrow.endBinding?.shapeId === text.id
            ? { ...arrow.endBinding, shapeId: id }
            : arrow.endBinding,
      } as Partial<Shape>,
    }));

  return { container, removeId: text.id, arrows };
}
