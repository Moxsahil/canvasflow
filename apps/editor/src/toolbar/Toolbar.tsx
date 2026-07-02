import { TOOLS, type Tool } from '../tools/tool';
import { ToolButton } from './ToolButton';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export function Toolbar({ activeTool, onToolChange }: ToolbarProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
      }}
      role="toolbar"
      aria-label="Drawing tools"
    >
      {TOOLS.map((t) => (
        <ToolButton
          key={t.id}
          tool={t.id}
          label={t.label}
          shortcut={t.shortcut}
          active={activeTool === t.id}
          onClick={() => onToolChange(t.id)}
        />
      ))}
    </div>
  );
}
