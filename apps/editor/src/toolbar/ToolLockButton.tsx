import { GlassDock, GlassDockItem } from '@/components/ui/glass-dock';
import { LockIcon, UnlockIcon } from '../assets/icons';
import { isLockableTool, type Tool } from '../tools/tool';
import { IconButton } from '../ui';

interface ToolLockButtonProps {
  activeTool: Tool;
  locked: boolean;
  onToggle: () => void;
}

/**
 * The tool lock, on its own island above the toolbar.
 *
 * Above rather than in the row because it is not a tool: the row is a radio
 * group where exactly one thing is chosen, and a padlock sitting in it would
 * read as a fifteenth tool that refuses to stay pressed.
 *
 * It appears only while a tool it governs is active. The lock decides what
 * happens after a tool makes a shape, so on the select or hand tool there is
 * nothing for it to decide, and a control that cannot do anything is worse
 * company for the toolbar than an empty space.
 */
export function ToolLockButton({ activeTool, locked, onToggle }: ToolLockButtonProps) {
  if (!isLockableTool(activeTool)) return null;

  const label = locked ? 'Tool lock on · Q' : 'Tool lock off · Q';

  return (
    // Stripped of the dock's own surface: a frame around a single button reads
    // as a second bar hovering over the real one. The button carries its own
    // hover and on states, which is all the shape it needs. Still a GlassDock
    // so it keeps the sliding tooltip every other control in the dock has.
    <GlassDock
      aria-label="Tool lock"
      className="self-end border-0 bg-transparent p-0 backdrop-blur-none"
    >
      <GlassDockItem id="tool-lock" label={label}>
        <IconButton
          icon={locked ? LockIcon : UnlockIcon}
          onClick={onToggle}
          pressed={locked}
          aria-label={`Tool lock, ${locked ? 'on' : 'off'}`}
        />
      </GlassDockItem>
    </GlassDock>
  );
}
