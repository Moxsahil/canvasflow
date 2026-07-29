import { UndoIcon, RedoIcon } from '../assets/icons';

interface UndoRedoButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export function UndoRedoButtons({ canUndo, canRedo, onUndo, onRedo }: UndoRedoButtonsProps) {
  return (
    <div style={{ display: 'inline-flex', gap: 4 }}>
      <IconButton
        icon={<UndoIcon width={14} height={14} />}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
      />
      <IconButton
        icon={<RedoIcon width={14} height={14} />}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
      />
    </div>
  );
}

interface IconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
  'aria-label': string;
}

function IconButton({ icon, onClick, disabled, title, ...aria }: IconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={aria['aria-label']}
      style={{
        width: 36,
        height: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        background: 'transparent',
        color: disabled ? '#d4d4d8' : '#3f3f46',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = '#f4f4f5';
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = 'transparent';
      }}
    >
      {icon}
    </button>
  );
}
