import { Redo2, Undo2, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/ui/cnippet-toolbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatShortcut } from '../help/platform';
import { t as translate, useT } from '../i18n';
import { MAX_ZOOM, MIN_ZOOM } from '../machine/tool-machine.types';
import type { SyncStatus } from '../sync/sync-status';

interface ZoomPanelProps {
  zoom: number;
  /**
   * Still on the panel's contract while `SyncStatusDot` sits commented out
   * below — Editor keeps passing it, so bringing the dot back is a matter of
   * uncommenting it and the `syncStatus` prop in the destructure.
   */
  syncStatus: SyncStatus;
  /** Undo and redo, at the end of the panel. Viewers have none. */
  history?: {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
  };
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
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
 * View controls, bottom-left: the zoom readout with the actions that move it,
 * then undo and redo.
 *
 * It shares this edge with the dock, which is centred on it and, at some 27rem
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
  onZoomIn,
  onZoomOut,
  onResetZoom,
  history,
}: ZoomPanelProps) {
  const t = useT();
  const zoomPercent = Math.round(zoom * 100);

  const readout = (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToolbarButton
          aria-label={t('zoom.resetCurrently', { percent: zoomPercent })}
          onClick={onResetZoom}
          render={
            <Button
              className="h-(--default-button-size) w-11 px-0 text-muted-foreground text-xs tabular-nums"
              variant="ghost"
            />
          }
        >
          {`${zoomPercent}%`}
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent>
        {t('zoom.reset')} · {formatShortcut('mod+0')}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <Toolbar
      aria-label={t('zoom.viewControls')}
      // What a toast stands on: it measures where this panel is.
      data-zoom-panel=""
      // Surface, radius, padding, gap and row alignment are the dock's, class
      // for class (see GlassDock) — including the shadow it does not have — so
      // the two bars along this edge read as one bar broken in two rather than
      // as two panels of slightly different build. `px-1.5 py-1` replace the
      // p-1 the component ships with; they merge, so neither is left to
      // stylesheet order to settle.
      className="absolute bottom-4 left-4 z-(--zIndex-layerUI) items-center max-md:bottom-[60px] gap-1 rounded-card border-(--dock-border-color) bg-(--dock-bg-color) px-1.5 py-1 backdrop-blur-xl backdrop-saturate-150"
    >
      {/* <SyncStatusDot status={syncStatus} /> */}

      {/* <ToolbarSeparator className="mx-1 h-6 self-center bg-(--dock-separator-color) data-[orientation=vertical]:my-0" /> */}

      {/* Tight: the readout alone, which is both the reading and the way back
          to 100%. It reads as a label, so the button keeps the ghost surface
          and only lights up on hover. */}
      {
        <>
          <ToolbarGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarButton
                  aria-label={t('commands.zoomOut')}
                  disabled={zoom <= MIN_ZOOM + ZOOM_EPSILON}
                  onClick={onZoomOut}
                  render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
                >
                  <Minus />
                </ToolbarButton>
              </TooltipTrigger>
              <TooltipContent>
                {t('commands.zoomOut')} · {formatShortcut('mod+-')}
              </TooltipContent>
            </Tooltip>

            {readout}

            <Tooltip>
              <TooltipTrigger asChild>
                <ToolbarButton
                  aria-label={t('commands.zoomIn')}
                  disabled={zoom >= MAX_ZOOM - ZOOM_EPSILON}
                  onClick={onZoomIn}
                  render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
                >
                  <Plus />
                </ToolbarButton>
              </TooltipTrigger>
              <TooltipContent>
                {t('commands.zoomIn')} · {formatShortcut('mod+=')}
              </TooltipContent>
            </Tooltip>
          </ToolbarGroup>

          {history && (
            <>
              {/* `my-0` and `self-center` correct what the component ships: its
                  margin would count towards the row's height, and its stretch
                  at this height would sit the line against the top. */}
              <ToolbarSeparator className="mx-1 h-4 self-center bg-(--dock-separator-color) data-[orientation=vertical]:my-0" />
              <ToolbarGroup>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToolbarButton
                      aria-label={t('commands.undo')}
                      disabled={!history.canUndo}
                      onClick={history.onUndo}
                      render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
                    >
                      <Undo2 />
                    </ToolbarButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('commands.undo')} · {formatShortcut('mod+z')}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToolbarButton
                      aria-label={t('commands.redo')}
                      disabled={!history.canRedo}
                      onClick={history.onRedo}
                      render={<Button className={BUTTON_CLASS} size="icon" variant="ghost" />}
                    >
                      <Redo2 />
                    </ToolbarButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('commands.redo')} · {formatShortcut('mod+shift+z')}
                  </TooltipContent>
                </Tooltip>
              </ToolbarGroup>
            </>
          )}
        </>
      }
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
      return { color: '#a1a1aa', label: translate('sync.idle'), pulse: false };
    case 'loading':
      return { color: '#f59e0b', label: translate('sync.loading'), pulse: true };
    case 'connecting':
      return { color: '#f59e0b', label: translate('sync.connecting'), pulse: true };
    case 'connected':
      return { color: '#22c55e', label: translate('sync.connected'), pulse: false };
    case 'reconnecting':
      return { color: '#f59e0b', label: translate('sync.reconnecting'), pulse: true };
    case 'offline':
      return {
        color: '#ef4444',
        label: translate('sync.offline'),
        pulse: false,
      };
    case 'error':
      return { color: '#ef4444', label: translate('sync.error'), pulse: false };
    default:
      return { color: '#a1a1aa', label: translate('sync.unknown'), pulse: false };
  }
}
