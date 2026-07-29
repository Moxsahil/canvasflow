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
} from '../assets/icons';
import type { Tool } from '../tools/tool';

type IconComponent = FC<SVGProps<SVGSVGElement>>;

const ICONS: Record<Tool, IconComponent> = {
  hand: HandIcon,
  select: SelectIcon,
  rectangle: RectangleIcon,
  ellipse: EllipseIcon,
  diamond: DiamondIcon,
  line: LineIcon,
  arrow: ArrowIcon,
  freehand: FreehandIcon,
  text: TextIcon,
};

interface ToolButtonProps {
  tool: Tool;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}

export function ToolButton({ tool, label, shortcut, active, onClick }: ToolButtonProps) {
  const Icon = ICONS[tool];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${label} — ${shortcut}`}
      aria-label={label}
      aria-pressed={active}
      style={{
        width: 40,
        height: 40,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        background: active ? '#F9E8A2' : 'transparent',
        color: active ? 'white' : '#3f3f46',
        cursor: 'pointer',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = '#f4f4f5';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <Icon width={14} height={14} />
    </button>
  );
}
