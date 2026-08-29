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
  ImageIcon,
  FrameIcon,
  LaserIcon,
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
  | 'image'
  | 'frame'
  | 'laser'
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
  image: 'image',
  frame: 'frame',
  // The laser is absent on purpose: it paints a trail that fades, not a shape,
  // so there is no kind for it to map to.
} as const satisfies Record<Exclude<Tool, 'hand' | 'select' | 'eraser' | 'laser'>, string>;

export interface ToolMeta {
  readonly id: Tool;
  readonly label: string;
  readonly icon: FC<SVGProps<SVGSVGElement>>;
  /** Letter shortcut. */
  readonly shortcut: string;
  /** Digit shortcut, shown as a superscript on the toolbar button. Hand has none. */
  readonly numericKey: string | null;
  /**
   * Lives behind the toolbar's overflow control rather than in the row itself.
   *
   * The row is a fixed piece of screen furniture and every tool added to it
   * makes the board smaller. What earns a place in it is being reached for
   * while drawing; a tool you pick deliberately, once, for a particular job
   * can afford the extra click. New tools should default to here, and only
   * move out when the row is genuinely where they belong.
   */
  readonly overflow?: boolean;
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
  { id: 'image', label: 'Image', icon: ImageIcon, shortcut: 'I', numericKey: '9' },
  // Both live in the overflow, and neither takes a digit: you lay out frames
  // before the work and point with the laser while presenting it. Neither is
  // something you flick to mid-drawing, which is what the row is for.
  { id: 'frame', label: 'Frame', icon: FrameIcon, shortcut: 'F', numericKey: null, overflow: true },
  {
    id: 'laser',
    label: 'Laser pointer',
    icon: LaserIcon,
    shortcut: 'K',
    numericKey: null,
    overflow: true,
  },
  { id: 'eraser', label: 'Eraser', icon: EraserIcon, shortcut: 'E', numericKey: '0' },
];

/**
 * Tools that open a file picker the moment they are chosen, rather than waiting
 * for a drag on the canvas. Selecting one is already the whole gesture, so the
 * toolbar hands straight off and drops back to select afterwards.
 */
export function isPickerTool(tool: Tool): boolean {
  return tool === 'image';
}
