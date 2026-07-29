import type { FC, SVGProps } from 'react';
import { UndoIcon, RedoIcon, ZoomInIcon, ZoomOutIcon } from '../assets/icons';

interface ZoomPanelProps {
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function ZoomPanel({
  zoom,
  canUndo,
  canRedo,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onUndo,
  onRedo,
}: ZoomPanelProps) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        display: 'inline-flex',
        alignItems: 'stretch',
        gap: 0,
        padding: 4,
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        zIndex: 10,
      }}
      role="toolbar"
      aria-label="Zoom and history controls"
    >
      <IconOnlyButton
        icon={ZoomOutIcon}
        onClick={onZoomOut}
        title="Zoom out (⌘−)"
        aria-label="Zoom out"
      />
      <button
        type="button"
        onClick={onResetZoom}
        title="Reset zoom to 100% (⌘0)"
        aria-label={`Reset zoom, currently ${zoomPercent}%`}
        style={{
          minWidth: 48,
          height: 32,
          padding: '0 8px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 4,
          background: 'transparent',
          color: '#3f3f46',
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          cursor: 'pointer',
          transition: 'background 100ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f4f4f5';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {zoomPercent}%
      </button>
      <IconOnlyButton
        icon={ZoomInIcon}
        onClick={onZoomIn}
        title="Zoom in (⌘+)"
        aria-label="Zoom in"
      />
      <div aria-hidden="true" style={{ width: 1, background: '#e4e4e7', margin: '4px 4px' }} />
      <IconOnlyButton
        icon={UndoIcon}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
        aria-label="Undo"
      />
      <IconOnlyButton
        icon={RedoIcon}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
        aria-label="Redo"
      />
    </div>
  );
}

interface IconOnlyButtonProps {
  icon: FC<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  'aria-label': string;
}

function IconOnlyButton({
  icon: Icon,
  onClick,
  disabled = false,
  title,
  ...aria
}: IconOnlyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={aria['aria-label']}
      style={{
        width: 32,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 4,
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
      <Icon width={16} height={16} />
    </button>
  );
}
