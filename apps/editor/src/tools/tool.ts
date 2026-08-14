import type { FC, SVGProps } from 'react';
import {
  HandIcon,
  SelectIcon,
  RectangleIcon,
  EllipseIcon,
  DiamondIcon,
  LineIcon,
  ArrowIcon,
  FreehandIcon,
  TextIcon,
  EraserIcon,
} from '../assets/icons';

export type Tool =
  | 'hand'
  | 'select'
  | 'rectangle'
  // | 'circle'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'text'
  | 'eraser';

export const TOOL_TO_SHAPE_KIND = {
  rectangle: 'rectangle',
  // circle: 'circle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  line: 'line',
  arrow: 'arrow',
  freehand: 'freehand',
  text: 'text',
} as const satisfies Record<Exclude<Tool, 'hand' | 'select' | 'eraser'>, string>;

export interface ToolMeta {
  readonly id: Tool;
  readonly label: string;
  readonly icon: FC<SVGProps<SVGSVGElement>>;
  /** Letter shortcut. */
  readonly shortcut: string;
  /** Digit shortcut, shown as a superscript on the toolbar button. Hand has none. */
  readonly numericKey: string | null;
}

/**
 * The single source of truth for tools: drives toolbar rendering and keyboard
 * dispatch alike, so a tool can't appear in one and be missing from the other.
 * Array order is the toolbar order.
 */
export const TOOLS: readonly ToolMeta[] = [
  { id: 'hand', label: 'Hand', icon: HandIcon, shortcut: 'H', numericKey: null },
  { id: 'select', label: 'Select', icon: SelectIcon, shortcut: 'V', numericKey: '1' },
  { id: 'rectangle', label: 'Rectangle', icon: RectangleIcon, shortcut: 'R', numericKey: '2' },
  { id: 'diamond', label: 'Diamond', icon: DiamondIcon, shortcut: 'D', numericKey: '3' },
  { id: 'ellipse', label: 'Ellipse', icon: EllipseIcon, shortcut: 'C', numericKey: '4' },
  { id: 'arrow', label: 'Arrow', icon: ArrowIcon, shortcut: 'A', numericKey: '5' },
  { id: 'line', label: 'Line', icon: LineIcon, shortcut: 'L', numericKey: '6' },
  { id: 'freehand', label: 'Freehand', icon: FreehandIcon, shortcut: 'P', numericKey: '7' },
  { id: 'text', label: 'Text', icon: TextIcon, shortcut: 'T', numericKey: '8' },
  { id: 'eraser', label: 'Eraser', icon: EraserIcon, shortcut: 'E', numericKey: '0' },
];
