import { TOOLS, type Tool } from '../tools/tool';
import { ToolButton } from './ToolButton';
import { UndoRedoButtons } from './UndoRedoButtons';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function Toolbar({
  activeTool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolbarProps) {
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
      <UndoRedoButtons canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} />
      <div style={{ width: 1, background: '#e4e4e7', margin: '4px 4px' }} />
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
