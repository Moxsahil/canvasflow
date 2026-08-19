import { ZoomInIcon, ZoomOutIcon } from '../assets/icons';
import { IconButton } from '../ui';
import type { SyncStatus } from '../sync/sync-status';

interface ZoomPanelProps {
  zoom: number;
  syncStatus: SyncStatus;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

/**
 * Zoom readout and sync status, bottom-right. Undo/redo used to live here too;
 * they sit with the tool dock now (see HistoryPanel), leaving this panel to
 * report on the view rather than mix in editing actions.
 */
export function ZoomPanel({ zoom, syncStatus, onZoomIn, onZoomOut, onResetZoom }: ZoomPanelProps) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        padding: 4,
        background: 'var(--island-bg-color)',
        borderRadius: 8,
        boxShadow: 'var(--shadow-island)',
        zIndex: 10,
      }}
      role="toolbar"
      aria-label="Zoom controls"
    >
      <SyncStatusDot status={syncStatus} />
      <div
        aria-hidden="true"
        style={{
          width: 1,
          alignSelf: 'stretch',
          background: 'var(--default-border-color)',
          margin: '4px 4px',
        }}
      />
      <IconButton
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
          color: 'var(--text-primary-color)',
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          cursor: 'pointer',
          transition: 'background 100ms ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--button-hover-bg)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      >
        {zoomPercent}%
      </button>
      <IconButton icon={ZoomInIcon} onClick={onZoomIn} title="Zoom in (⌘+)" aria-label="Zoom in" />
    </div>
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
      case 'connecting':
        return { color: '#f59e0b', label: 'Connecting...', pulse: true };
      case 'connected':
        return { color: '#22c55e', label: 'Live', pulse: false };
      case 'reconnecting':
        return { color: '#f59e0b', label: 'Reconnecting...', pulse: true };
      case 'offline':
        return {
          color: '#ef4444',
          label: 'Offline - changes will sync when reconnected',
          pulse: false,
        };
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
