import { useCallback, useMemo, type KeyboardEvent } from 'react';
import { OmniCommandPalette, type OmniPaletteSection } from '@/components/ui/omni-command-palette';
import { formatShortcutKeys } from '../help/platform';
import { isCommandPaletteShortcut } from '../tools/shortcuts';
import { RECENT_SECTION_ID, useCommandPalette } from './useCommandPalette';
import type { EditorCommand } from './useEditorCommands';

/** What opens the palette, shown as a pill in its own search field. */
export const COMMAND_PALETTE_SHORTCUT = 'mod+/';

interface CommandPaletteProps {
  /** Already filtered to what applies — see useEditorCommands. */
  commands: readonly EditorCommand[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The editor root, where the theme tokens live. */
  portalContainer: HTMLElement | null;
}

/**
 * The palette, wired: the hook decides what to list and which row is live, and
 * the component draws it.
 *
 * Mounted rather than rendered conditionally — the dialog is what shows and
 * hides, and the hook clears itself each time it opens.
 */
export function CommandPalette({
  commands,
  open,
  onOpenChange,
  portalContainer,
}: CommandPaletteProps) {
  const onClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  const palette = useCommandPalette({ commands, open, onClose });

  const sections = useMemo<OmniPaletteSection[]>(
    () =>
      palette.sections.map((section) => ({
        id: section.id,
        label: section.label,
        items: section.rows.map((row) => ({
          id: row.command.id,
          label: row.command.label,
          icon: row.command.icon,
          // A recent row is out of its category, so it says which one it came
          // from — without that, "Duplicate selection" and "Copy selection"
          // sit together at the top with nothing to tell them apart.
          subtitle: section.id === RECENT_SECTION_ID ? row.command.category : undefined,
          shortcut: row.command.shortcut ? formatShortcutKeys(row.command.shortcut) : undefined,
          destructive: row.command.destructive,
          ranges: row.ranges,
        })),
      })),
    [palette.sections],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const row = palette.rows.find((candidate) => candidate.command.id === id);
      if (row) palette.run(row.command);
    },
    [palette],
  );

  const hintKeys = useMemo(() => formatShortcutKeys(COMMAND_PALETTE_SHORTCUT), []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // The editor's own handler is switched off while this is up, so the
      // combo that opened the palette has to be answered from inside it.
      if (isCommandPaletteShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      palette.onKeyDown(event);
    },
    [palette, onClose],
  );

  return (
    <OmniCommandPalette
      open={open}
      onOpenChange={onOpenChange}
      query={palette.query}
      onQueryChange={palette.setQuery}
      sections={sections}
      activeId={palette.activeId}
      onActiveIdChange={palette.setActiveId as (id: string) => void}
      onSelect={handleSelect}
      onKeyDown={handleKeyDown}
      hintKeys={hintKeys}
      portalContainer={portalContainer}
    />
  );
}
