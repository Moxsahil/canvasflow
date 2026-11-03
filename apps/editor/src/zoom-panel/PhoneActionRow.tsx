import { Copy, Palette, Redo2, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from '@/components/ui/cnippet-toolbar';
import {
  InlineDropdownMenu,
  InlineDropdownMenuContent,
  InlineDropdownMenuItem,
  InlineDropdownMenuTrigger,
} from '@/components/ui/inline-dropdown-menu';
import { cn } from '@/lib/utils';
import { LockIcon, UnlockIcon } from '../assets/icons';
import { useT } from '../i18n';
import { MAX_ZOOM, MIN_ZOOM } from '../machine/tool-machine.types';
import { isLockableTool, type Tool } from '../tools/tool';

interface PhoneActionRowProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomToFit: () => void;
  /** The style panel's button, while there is something to style. */
  stylePanel?: { open: boolean; onToggle: () => void };
  /** Left out for viewers, who change nothing. */
  editing?: {
    activeTool: Tool;
    toolLocked: boolean;
    onToggleToolLock: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    canDuplicate: boolean;
    canDelete: boolean;
    onDuplicate: () => void;
    onDelete: () => void;
  };
  /** Where the zoom menu portals. Outside `.cf-editor` its tokens are empty. */
  container: HTMLElement | null;
}

const ZOOM_EPSILON = 0.001;

/**
 * The zoom panel's surface, class for class, so the row reads as the same
 * chrome the desktop has along this edge.
 */
const SURFACE =
  'items-center gap-1 rounded-card border-(--dock-border-color) bg-(--dock-bg-color) px-1.5 py-1 backdrop-blur-xl backdrop-saturate-150';

const BUTTON_CLASS = 'size-(--default-button-size)';

/**
 * A phone's row above the toolbar: the zoom on the left, and on the right the
 * actions a keyboard would otherwise give — tool lock (for a tool that can be
 * kept), undo, redo, duplicate and delete.
 *
 * Duplicate and delete stay in place with nothing selected, disabled, so the
 * row never shifts under a thumb as the selection comes and goes.
 */
export function PhoneActionRow({
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomToFit,
  stylePanel,
  editing,
  container,
}: PhoneActionRowProps) {
  const t = useT();
  const zoomPercent = Math.round(zoom * 100);

  const action = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    disabled = false,
    pressed?: boolean,
  ) => (
    <ToolbarButton
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      render={
        <Button
          className={cn(BUTTON_CLASS, pressed && 'bg-accent text-accent-foreground')}
          size="icon"
          variant="ghost"
        />
      }
    >
      {icon}
    </ToolbarButton>
  );

  return (
    // What a toast stands on: it measures where this row is, as it does the
    // zoom panel on a wider screen.
    // Wraps on the narrowest phones: the actions drop to a line of their own
    // rather than run off the edge.
    <div className="flex flex-wrap items-center gap-1.5" data-zoom-panel="">
      {stylePanel && (
        <Toolbar aria-label={t('style.style')} className={SURFACE}>
          {action(t('style.style'), <Palette />, stylePanel.onToggle, false, stylePanel.open)}
        </Toolbar>
      )}
      <InlineDropdownMenu>
        <InlineDropdownMenuTrigger asChild>
          <Button
            aria-label={t('zoom.resetCurrently', { percent: zoomPercent })}
            className={cn(
              SURFACE,
              'flex h-auto border px-2.5 text-muted-foreground text-xs tabular-nums',
            )}
            variant="ghost"
          >
            <span className="flex h-(--default-button-size) items-center">{`${zoomPercent}%`}</span>
          </Button>
        </InlineDropdownMenuTrigger>
        <InlineDropdownMenuContent
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          container={container}
          className="min-w-44"
        >
          <InlineDropdownMenuItem disabled={zoom >= MAX_ZOOM - ZOOM_EPSILON} onSelect={onZoomIn}>
            {t('commands.zoomIn')}
          </InlineDropdownMenuItem>
          <InlineDropdownMenuItem disabled={zoom <= MIN_ZOOM + ZOOM_EPSILON} onSelect={onZoomOut}>
            {t('commands.zoomOut')}
          </InlineDropdownMenuItem>
          <InlineDropdownMenuItem onSelect={onZoomToFit}>{t('zoom.fitAll')}</InlineDropdownMenuItem>
          <InlineDropdownMenuItem onSelect={onResetZoom}>{t('zoom.reset')}</InlineDropdownMenuItem>
        </InlineDropdownMenuContent>
      </InlineDropdownMenu>

      {editing && (
        <Toolbar aria-label={t('toolbar.editingTools')} className={cn(SURFACE, 'ml-auto')}>
          {/* Only for a tool that can be kept, as on a desktop: select, the
              hand, the eraser and the rest go back to nothing to lock. */}
          {isLockableTool(editing.activeTool) && (
            <>
              <ToolbarGroup>
                {action(
                  editing.toolLocked ? t('toolLock.onSpoken') : t('toolLock.offSpoken'),
                  editing.toolLocked ? <LockIcon /> : <UnlockIcon />,
                  editing.onToggleToolLock,
                  false,
                  editing.toolLocked,
                )}
              </ToolbarGroup>
              <ToolbarSeparator className="mx-1 h-4 self-center bg-(--dock-separator-color) data-[orientation=vertical]:my-0" />
            </>
          )}
          <ToolbarGroup>
            {action(t('commands.undo'), <Undo2 />, editing.onUndo, !editing.canUndo)}
            {action(t('commands.redo'), <Redo2 />, editing.onRedo, !editing.canRedo)}
            {action(
              t('contextMenu.duplicate'),
              <Copy />,
              editing.onDuplicate,
              !editing.canDuplicate,
            )}
            {action(
              t('contextMenu.deleteSelection'),
              <Trash2 />,
              editing.onDelete,
              !editing.canDelete,
            )}
          </ToolbarGroup>
        </Toolbar>
      )}
    </div>
  );
}

/**
 * Ends typing on a phone, where there is no Escape and the board to tap away
 * on may be under the keyboard. The words are kept: the editors commit when
 * they lose focus, which is all this does.
 */
export function PhoneDoneButton() {
  const t = useT();
  return (
    <Toolbar aria-label={t('common.done')} className={SURFACE}>
      <ToolbarButton
        onClick={() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        }}
        render={<Button className="h-(--default-button-size) px-3 text-xs" variant="ghost" />}
      >
        {t('common.done')}
      </ToolbarButton>
    </Toolbar>
  );
}
