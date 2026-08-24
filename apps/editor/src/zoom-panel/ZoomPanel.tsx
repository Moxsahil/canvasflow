import { Maximize, Minus, Moon, Plus, RotateCcw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/ui/cnippet-toolbar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatShortcut } from '../help/platform';
import { MAX_ZOOM, MIN_ZOOM } from '../machine/tool-machine.types';
import type { SyncStatus } from '../sync/sync-status';
import type { ResolvedTheme } from '../theme';

interface ZoomPanelProps {
  zoom: number;
  /**
   * Still on the panel's contract while `SyncStatusDot` sits commented out
   * below — Editor keeps passing it, so bringing the dot back is a matter of
   * uncommenting it and the `syncStatus` prop in the destructure.
   */
  syncStatus: SyncStatus;
  /** The theme actually painted, so the toggle shows a side even on `system`. */
  theme: ResolvedTheme;
  onThemeChange: (theme: ResolvedTheme) => void;
  /** Fitting has nothing to frame on an empty board. */
  canZoomToFit: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
}

/** Zoom multiplies by 1.2 a step, so it lands near a limit rather than on it. */
const ZOOM_EPSILON = 0.001;

/**
 * Every control in this panel is the same square as the dock's buttons, off the
 * same token `.cf-icon-button` and `.cf-tool-button__icon` measure themselves
 * with — so the two bars keep matching heights if that row size ever changes.
 */
const BUTTON_CLASS = 'size-(--default-button-size)';

/**
 * View controls, bottom-right: sync status, theme, and the zoom readout with
 * the actions that move it. Undo/redo used to live here too; they sit with the
 * tool dock now (see HistoryPanel), so this panel is about the view rather than
 * a mix of view and editing actions.
 */
export function ZoomPanel({
  zoom,
  // syncStatus,
  theme,
  onThemeChange,
  canZoomToFit,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
}: ZoomPanelProps) {
  const zoomPercent = Math.round(zoom * 100);

  return (
    <Toolbar
      aria-label="View controls"
      // Surface, radius, padding and gap are the dock's, class for class (see
      // GlassDock), so the two bars along this edge read as one bar broken in
      // two rather than as two panels of slightly different build. `p-0` clears
      // the p-1 the component ships with, which px/py would otherwise leave to
      // stylesheet order to settle.
      className="absolute right-4 bottom-4 z-(--zIndex-layerUI) gap-1 rounded-2xl border-(--dock-border-color) bg-(--dock-bg-color) p-0 px-2 py-1.5 shadow-(--dock-shadow) backdrop-blur-xl backdrop-saturate-150"
    >
      {/* <SyncStatusDot status={syncStatus} /> */}

      {/* <ToolbarSeparator className="mx-1 h-6 bg-(--dock-separator-color)" /> */}

      <ToggleGroup
        className="gap-1 border-none p-0"
        value={[theme]}
        onValueChange={(next: unknown[]) => {
          const picked = next[0];
          // An empty array means the pressed side was pressed again. A board is
          // always painted either light or dark, so that leaves the theme alone.
          if (picked === 'light' || picked === 'dark') onThemeChange(picked);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarButton
              aria-label="Light mode"
              render={<ToggleGroupItem className={BUTTON_CLASS} value="light" />}
            >
              <Sun />
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>Light mode</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarButton
              aria-label="Dark mode"
              render={<ToggleGroupItem className={BUTTON_CLASS} value="dark" />}
            >
              <Moon />
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>Dark mode</TooltipContent>
        </Tooltip>
      </ToggleGroup>

      <ToolbarSeparator className="mx-1 h-6 bg-(--dock-separator-color)" />

      <ToolbarGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarButton
              aria-label="Zoom out"
              disabled={zoom <= MIN_ZOOM + ZOOM_EPSILON}
              onClick={onZoomOut}
              render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
            >
              <Minus />
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>Zoom out · {formatShortcut('mod+-')}</TooltipContent>
        </Tooltip>

        <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">
          {zoomPercent}%
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarButton
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM - ZOOM_EPSILON}
              onClick={onZoomIn}
              render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
            >
              <Plus />
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>Zoom in · {formatShortcut('mod+=')}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarButton
              aria-label="Zoom to fit all shapes"
              disabled={!canZoomToFit}
              onClick={onZoomToFit}
              render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
            >
              <Maximize />
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>Zoom to fit · {formatShortcut('mod+2')}</TooltipContent>
        </Tooltip>
      </ToolbarGroup>

      <ToolbarSeparator className="mx-1 h-6 bg-(--dock-separator-color)" />

      <ToolbarGroup>
        <Tooltip>
          <TooltipTrigger asChild>
            <ToolbarButton
              aria-label={`Reset zoom to 100%, currently ${zoomPercent}%`}
              onClick={onResetZoom}
              render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
            >
              <RotateCcw />
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>Reset zoom · {formatShortcut('mod+0')}</TooltipContent>
        </Tooltip>
      </ToolbarGroup>
    </Toolbar>
  );
}

interface SyncStatusDotProps {
  status: SyncStatus;
}

/**
 * Connection state as a coloured dot. `role="status"` rather than a button:
 * there is nothing to press, and it announces itself when the state changes.
 *
 * Exported while it sits commented out of the panel above — `tsc` runs with
 * `noUnusedLocals`, which would otherwise fail the build on a parked local.
 */
export function SyncStatusDot({ status }: SyncStatusDotProps) {
  const { color, label, pulse } = describeSyncStatus(status);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-label={label}
          className="inline-flex size-8 shrink-0 items-center justify-center"
        >
          <span
            className="size-2 rounded-full"
            style={{
              background: color,
              animation: pulse ? 'sync-pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function describeSyncStatus(status: SyncStatus): {
  color: string;
  label: string;
  pulse: boolean;
} {
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
}
