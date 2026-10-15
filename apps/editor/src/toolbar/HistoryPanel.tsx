import { GlassDockGroup, GlassDockItem } from '@/components/ui/glass-dock';
import { UndoIcon, RedoIcon } from '../assets/icons';
import { IconButton } from '../ui';
import { useT } from '../i18n';

interface HistoryPanelProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Undo/redo, at the left end of the dock — history is an editing action like
 * the tools are, and sits closer to them than to the zoom readout it used to
 * share a panel with.
 */
export function HistoryPanel({ canUndo, canRedo, onUndo, onRedo }: HistoryPanelProps) {
  const t = useT();
  return (
    <GlassDockGroup>
      <GlassDockItem id="history-undo" label={`${t('commands.undo')} · ⌘Z`}>
        <IconButton
          icon={UndoIcon}
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t('commands.undo')}
        />
      </GlassDockItem>
      <GlassDockItem id="history-redo" label={`${t('commands.redo')} · ⌘⇧Z`}>
        <IconButton
          icon={RedoIcon}
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t('commands.redo')}
        />
      </GlassDockItem>
    </GlassDockGroup>
  );
}
