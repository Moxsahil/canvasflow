import { UndoIcon, RedoIcon } from '../assets/icons';
import { IconButton, Island, Stack } from '../ui';

interface HistoryPanelProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

/**
 * Undo/redo, on their own Island immediately left of the tool dock — history
 * is an editing action like the tools are, and sits closer to them than to the
 * zoom readout it used to share a panel with.
 */
export function HistoryPanel({ canUndo, canRedo, onUndo, onRedo }: HistoryPanelProps) {
  return (
    <Island padding={1}>
      <Stack.Row gap={1} align="center">
        <IconButton
          icon={UndoIcon}
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (⌘Z)"
          aria-label="Undo"
        />
        <IconButton
          icon={RedoIcon}
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (⌘⇧Z)"
          aria-label="Redo"
        />
      </Stack.Row>
    </Island>
  );
}
