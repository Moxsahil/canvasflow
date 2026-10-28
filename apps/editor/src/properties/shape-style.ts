import {
  isArrow,
  isFreehand,
  isNote,
  isText,
  isTopic,
  readMapLayout,
  readMapLines,
  readTopicLook,
  type Shape,
} from '@canvasflow/canvas-engine';
import type { ItemStyle } from '../machine/tool-machine.types';

/**
 * Read a full ItemStyle off a shape so the panel can display it.
 *
 * Fields the shape's kind doesn't carry (a rectangle has no font, a line has no
 * arrowheads) fall back to the pending style, so switching selection never
 * blanks a control that's about to become relevant again.
 */
export function itemStyleFromShape(shape: Shape, fallback: ItemStyle): ItemStyle {
  return {
    strokeColor: shape.strokeColor,
    fillColor: shape.fillColor,
    fillStyle: shape.fillStyle,
    strokeWidth: shape.strokeWidth,
    strokeStyle: shape.strokeStyle,
    roughness: shape.roughness,
    opacity: shape.opacity,
    edges: 'edges' in shape ? shape.edges : fallback.edges,
    fontFamily:
      isText(shape) || isTopic(shape) || isNote(shape) ? shape.fontFamily : fallback.fontFamily,
    fontSize: isText(shape) || isTopic(shape) || isNote(shape) ? shape.fontSize : fallback.fontSize,
    textAlign: isText(shape) || isNote(shape) ? shape.textAlign : fallback.textAlign,
    arrowType: isArrow(shape) ? shape.arrowType : fallback.arrowType,
    startArrowhead: isArrow(shape) ? shape.startArrowhead : fallback.startArrowhead,
    endArrowhead: isArrow(shape) ? shape.endArrowhead : fallback.endArrowhead,
    simulatePressure: isFreehand(shape) ? shape.simulatePressure : fallback.simulatePressure,
    // A topic's layout and lines are its map's, which only the centre holds:
    // the editor puts in the centre's for a branch — see `mapStyleFor`.
    mapLayout: isTopic(shape) ? readMapLayout(shape.mapLayout) : fallback.mapLayout,
    mapLines: isTopic(shape) ? readMapLines(shape.mapLines) : fallback.mapLines,
    topicShape: isTopic(shape) ? readTopicLook(shape.topicShape) : fallback.topicShape,
    noteColor: isNote(shape) && shape.fillColor ? shape.fillColor : fallback.noteColor,
    noteFontSize: isNote(shape) ? shape.fontSize : fallback.noteFontSize,
    noteTextAlign: isNote(shape) ? shape.textAlign : fallback.noteTextAlign,
  };
}
