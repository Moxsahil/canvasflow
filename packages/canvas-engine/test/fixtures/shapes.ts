import {
  createRectangle,
  createEllipse,
  createDiamond,
  createArrow,
  createFreehand,
  createLine,
  createText,
} from '../../src/shapes/index.js';
import type {
  RectangleShape,
  EllipseShape,
  FreehandShape,
  DiamondShape,
  LineShape,
  TextShape,
  ArrowShape,
} from '../../src/shapes/shape.js';

export function makeTestRectangle(overrides?: Partial<RectangleShape>): RectangleShape {
  return {
    ...createRectangle({
      id: 'rect-1',
      x: 10,
      y: 10,
      width: 100,
      height: 50,
      strokeColor: '#1e293b',
      fillColor: null,
      strokeWidth: 2,
      seed: 42,
    }),
    ...overrides,
  };
}

export function makeTestEllipse(overrides?: Partial<EllipseShape>): EllipseShape {
  return {
    ...createEllipse({
      id: 'ellipse-1',
      x: 10,
      y: 10,
      width: 100,
      height: 50,
      seed: 43,
    }),
    ...overrides,
  };
}

export function makeTestDiamond(overrides?: Partial<DiamondShape>): DiamondShape {
  return {
    ...createDiamond({
      id: 'diamond-1',
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      seed: 44,
    }),
    ...overrides,
  };
}

export function makeTestLine(overrides?: Partial<LineShape>): LineShape {
  return {
    ...createLine({
      id: 'line-1',
      x: 10,
      y: 10,
      points: [
        [0, 0],
        [100, 50],
      ],
      seed: 45,
    }),
    ...overrides,
  };
}

export function makeTestArrow(overrides?: Partial<ArrowShape>): ArrowShape {
  return {
    ...createArrow({
      id: 'arrow-1',
      x: 10,
      y: 10,
      points: [
        [0, 0],
        [100, 50],
      ],
      seed: 46,
    }),
    ...overrides,
  };
}

export function makeTestFreehand(overrides?: Partial<FreehandShape>): FreehandShape {
  return {
    ...createFreehand({
      id: 'freehand-1',
      x: 10,
      y: 10,
      points: [
        [0, 0],
        [20, 10],
        [40, 30],
        [60, 50],
      ],
      seed: 47,
    }),
    ...overrides,
  };
}

export function makeTestText(overrides?: Partial<TextShape>): TextShape {
  return {
    ...createText({
      id: 'text-1',
      x: 10,
      y: 10,
      text: 'Hello Sahil',
      fontSize: 20,
      seed: 48,
    }),
    ...overrides,
  };
}

export function makeAllTestShapes() {
  return [
    makeTestRectangle({ id: 'r' }),
    makeTestEllipse({ id: 'e', x: 130 }),
    makeTestDiamond({ id: 'd', x: 250 }),
    makeTestLine({ id: 'l', x: 380 }),
    makeTestArrow({ id: 'a', x: 510 }),
    makeTestFreehand({ id: 'f', x: 640 }),
    makeTestText({ id: 't', x: 770 }),
  ];
}
