import { Maximize, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/ui/cnippet-toolbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatShortcut } from '../help/platform';
import { MAX_ZOOM, MIN_ZOOM } from '../machine/tool-machine.types';
import type { SyncStatus } from '../sync/sync-status';
import { BREAKPOINT, getBreakpoint } from '../ui/breakpoints';

interface ZoomPanelProps {
  zoom: number;
  /**
   * Still on the panel's contract while `SyncStatusDot` sits commented out
   * below — Editor keeps passing it, so bringing the dot back is a matter of
   * uncommenting it and the `syncStatus` prop in the destructure.
   */
  syncStatus: SyncStatus;
  /** Fitting has nothing to frame on an empty board, which disables its button. */
  canZoomToFit: boolean;
  /**
   * Width of the canvas, which is what the panel has to share with the dock in
   * the middle of the same edge. See the shedding rules on the component.
   */
  canvasWidth: number;
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
 * View controls, bottom-right: sync status and the zoom readout with the
 * actions that move it. Undo/redo used to live here too; they sit with the tool
 * dock now (see HistoryPanel), and the theme picker sits in the sidebar's
 * Appearance section — so this panel is about the view alone rather than a mix
 * of view, editing and app settings.
 *
 * It shares this edge with the dock, which is centred on it and, at some 33rem
 * of buttons, much the wider of the two. So the panel gives way as the canvas
 * narrows rather than being painted over: below DESKTOP everything but the
 * readout goes, and below TABLET the panel goes with it. Those are a rung
 * higher than the shape of the panel alone would need, because what it has to
 * clear is half the dock plus the gap, not its own width.
 *
 * Nothing is lost with it: every action here keeps its keyboard shortcut at
 * every width, and the readout — which is also the way back to 100% — is the
 * last thing to go.
 */
export function ZoomPanel({
  zoom,
  // syncStatus,
  canZoomToFit,
  canvasWidth,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
}: ZoomPanelProps) {
  const zoomPercent = Math.round(zoom * 100);
  const breakpoint = getBreakpoint(canvasWidth);

  if (breakpoint < BREAKPOINT.TABLET) return null;

  const readout = (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToolbarButton
          aria-label={`Reset zoom to 100%, currently ${zoomPercent}%`}
          onClick={onResetZoom}
          render={
            <Button
              className="h-(--default-button-size) w-12 px-0 text-muted-foreground text-xs tabular-nums"
              variant="ghost"
            />
          }
        >
          {`${zoomPercent}%`}
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent>Reset zoom · {formatShortcut('mod+0')}</TooltipContent>
    </Tooltip>
  );

  return (
    <Toolbar
      aria-label="View controls"
      // Surface, radius, padding, gap and row alignment are the dock's, class
      // for class (see GlassDock) — including the shadow it does not have — so
      // the two bars along this edge read as one bar broken in two rather than
      // as two panels of slightly different build. `p-0` clears the p-1 the
      // component ships with, which px/py would otherwise leave to stylesheet
      // order to settle.
      className="absolute right-4 bottom-4 z-(--zIndex-layerUI) items-center gap-1 rounded-2xl border-(--dock-border-color) bg-(--dock-bg-color) p-0 px-2 py-1.5 backdrop-blur-xl backdrop-saturate-150"
    >
      {/* <SyncStatusDot status={syncStatus} /> */}

      {/* <ToolbarSeparator className="mx-1 h-6 self-center bg-(--dock-separator-color) data-[orientation=vertical]:my-0" /> */}

      {/* Tight: the readout alone, which is both the reading and the way back
          to 100%. It reads as a label, so the button keeps the ghost surface
          and only lights up on hover. */}
      {breakpoint < BREAKPOINT.DESKTOP ? (
        readout
      ) : (
        <>
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

            {readout}

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
          </ToolbarGroup>

          {/* Two corrections to what the component ships. `my-0`, spelled in
              the same variant it sets the margin in so the two merge: left on,
              the separator is the tallest thing in the row at 24px plus 6px a
              side, and the bar sizes itself to that, standing 4px prouder than
              the dock. And `self-center`, because its `self-stretch` with a
              height this definite lays out as flex-start — which sits the line
              against the top of the row rather than in the middle of it. */}
          <ToolbarSeparator className="mx-1 h-6 self-center bg-(--dock-separator-color) data-[orientation=vertical]:my-0" />

          <ToolbarGroup>
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
        </>
      )}
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
