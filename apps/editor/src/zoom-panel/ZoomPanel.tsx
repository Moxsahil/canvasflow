import type { FC, SVGProps } from 'react';
import { UndoIcon, RedoIcon, ZoomInIcon, ZoomOutIcon } from '../assets/icons';
import type { SyncStatus } from '../sync/BoardSync';

interface ZoomPanelProps {
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  syncStatus: SyncStatus;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Floating panel in bottom-left corner. Contains sync status dot,
 * zoom controls, and undo/redo. Excalidraw-style layout.
 */
export function ZoomPanel({
  zoom,
  canUndo,
  canRedo,
  syncStatus,
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
        alignItems: 'center',
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
      <SyncStatusDot status={syncStatus} />
      <div
        aria-hidden="true"
        style={{ width: 1, alignSelf: 'stretch', background: '#e4e4e7', margin: '4px 4px' }}
      />
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
      <div
        aria-hidden="true"
        style={{ width: 1, alignSelf: 'stretch', background: '#e4e4e7', margin: '4px 4px' }}
      />
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
  title: string;
  'aria-label': string;
  disabled?: boolean;
}

/**
 * Square icon button sized to match the panel's 32px row. Hover feedback is
 * suppressed while disabled so undo/redo read as unavailable.
 */
function IconOnlyButton({
  icon: Icon,
  onClick,
  title,
  'aria-label': ariaLabel,
  disabled = false,
}: IconOnlyButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        width: 32,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 4,
        background: 'transparent',
        color: '#3f3f46',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = '#f4f4f5';
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.background = 'transparent';
      }}
    >
      <Icon width={14} height={14} />
    </button>
  );
}

interface SyncStatusDotProps {
  status: SyncStatus;
}

function SyncStatusDot({ status }: SyncStatusDotProps) {
  // Color and tooltip based on status
  const { color, label, pulse } = (() => {
    switch (status) {
      case 'idle':
        return { color: '#a1a1aa', label: 'Not connected', pulse: false };
      case 'loading':
        return { color: '#f59e0b', label: 'Loading board...', pulse: true };
      case 'loaded':
        return { color: '#22c55e', label: 'Loaded', pulse: false };
      case 'saving':
        return { color: '#f59e0b', label: 'Saving...', pulse: true };
      case 'saved':
        return { color: '#22c55e', label: 'Saved', pulse: false };
      case 'error':
        return { color: '#ef4444', label: 'Sync error', pulse: false };
      default:
        return { color: '#a1a1aa', label: 'Unknown', pulse: false };
    }
  })();

  return (
    <div
      title={label}
      aria-label={label}
      style={{
        width: 32,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          animation: pulse ? 'sync-pulse 1.5s ease-in-out infinite' : 'none',
        }}
      />
    </div>
  );
}
