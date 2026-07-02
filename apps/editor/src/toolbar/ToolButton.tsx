import {
  MousePointer2,
  Square,
  Circle,
  Diamond,
  Minus,
  ArrowRight,
  Pencil,
  Type,
  type LucideIcon,
} from 'lucide-react';
import type { Tool } from '../tools/tool';

const ICONS: Record<Tool, LucideIcon> = {
  select: MousePointer2,
  rectangle: Square,
  ellipse: Circle,
  diamond: Diamond,
  line: Minus,
  arrow: ArrowRight,
  freehand: Pencil,
  text: Type,
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
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        background: active ? '#6366f1' : 'transparent',
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
      <Icon size={18} />
    </button>
  );
}
