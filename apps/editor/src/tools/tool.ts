export type Tool =
  | 'select'
  | 'rectangle'
  // | 'circle'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'freehand'
  | 'text';

export const TOOL_TO_SHAPE_KIND = {
  rectangle: 'rectangle',
  // circle: 'circle',
  ellipse: 'ellipse',
  diamond: 'diamond',
  line: 'line',
  arrow: 'arrow',
  freehand: 'freehand',
  text: 'text',
} as const satisfies Record<Exclude<Tool, 'select'>, string>;

export interface ToolMeta {
  readonly id: Tool;
  readonly label: string;
  readonly shortcut: string;
}

export const TOOLS: readonly ToolMeta[] = [
  { id: 'select', label: 'Select', shortcut: 'V' },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R' },
  // { id: 'circle', label: 'circle', shortcut: 'C' },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'E' },
  { id: 'diamond', label: 'Diamond', shortcut: 'D' },
  { id: 'line', label: 'Line', shortcut: 'L' },
  { id: 'arrow', label: 'Arrow', shortcut: 'A' },
  { id: 'freehand', label: 'Freehand', shortcut: 'P' },
  { id: 'text', label: 'Text', shortcut: 'T' },
];
