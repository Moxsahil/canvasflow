import type { ShapeId, HexColor, ISODateString } from './primitives.js';

export type ShapeKind =
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'arrow'
  | 'line'
  | 'freehand'
  | 'text'
  | 'image';

export interface Point {
  x: number;
  y: number;
}

export interface ShapeStyle {
  strokeColor: HexColor;
  fillColor: HexColor | null;
  strokeWidth: number;
  opacity: number;
  roughness: number;
}

interface ShapeBase {
  id: ShapeId;
  kind: ShapeKind;
  position: Point;
  width: number;
  height: number;
  rotation: number;
  style: ShapeStyle;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  zIndex: number;
}

export interface RectangleShape extends ShapeBase {
  kind: 'rectangle';
}

export interface EllipseShape extends ShapeBase {
  kind: 'ellipse';
}

export interface DiamondShape extends ShapeBase {
  kind: 'diamond';
}

export interface ArrowShape extends ShapeBase {
  kind: 'arrow';
  startPoint: Point;
  endPoint: Point;
}

export interface LineShape extends ShapeBase {
  kind: 'line';
  startPoint: Point;
  endPoint: Point;
}

export interface FreehandShape extends ShapeBase {
  kind: 'freehand';
  points: ReadonlyArray<Point>;
}

export interface TextShape extends ShapeBase {
  kind: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
}

export interface ImageShape extends ShapeBase {
  kind: 'image';
  url: string;
  altText: string;
}

export type Shape =
  | RectangleShape
  | EllipseShape
  | DiamondShape
  | ArrowShape
  | LineShape
  | FreehandShape
  | TextShape
  | ImageShape;
