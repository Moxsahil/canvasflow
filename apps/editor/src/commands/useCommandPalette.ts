import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { CommandId } from './commands';
import { groupByCategory, matchCommands, type MatchRange } from './match';
import { readRecents, storeRecents, withRecent } from './recents';
import type { EditorCommand } from './useEditorCommands';

export interface PaletteRow {
  readonly command: EditorCommand;
  /** Slices of the label the query matched, for emphasis. Empty without a query. */
  readonly ranges: readonly MatchRange[];
}

export interface PaletteSection {
  /** `recent`, or the category's own name. */
  readonly id: string;
  readonly label: string;
  readonly rows: readonly PaletteRow[];
}

export const RECENT_SECTION_ID = 'recent';

export interface CommandPalette {
  query: string;
  setQuery: (next: string) => void;
  /** What to render, in order. */
  sections: readonly PaletteSection[];
  /** The same rows flattened, should the view want to index them. */
  rows: readonly PaletteRow[];
  /** The row Enter would run, and the one to draw as highlighted. */
  activeId: CommandId | null;
  /** Point the highlight at a row — for hover, which should not scroll it. */
  setActiveId: (id: CommandId) => void;
  run: (command: EditorCommand) => void;
  /** Spread onto the input, or onto whatever wraps it. */
  onKeyDown: (event: KeyboardEvent) => void;
  /** A query was typed and nothing matched it. */
  noMatches: boolean;
}

/**
 * What the palette lists, for a set of available commands and a query.
 *
 * Pulled out of the hook because this is the part with decisions in it — what
 * recents are worth showing, where they go, and what the categories do once
 * ranking takes over — and none of those need a rendered component to check.
 *
 * `query` is expected already trimmed. `recents` is most-recent-first and may
 * name commands that are not currently available; those are dropped, which is
 * how a recent that no longer applies disappears rather than failing on Enter.
 */
export function buildPaletteSections(
  commands: readonly EditorCommand[],
  query: string,
  recents: readonly CommandId[],
): PaletteSection[] {
  const matched = matchCommands(commands, query);

  // Recents are a shortcut past the list, so they only make sense while there
  // is a list to skip. Once you are searching, ranking is the point.
  const recentRows: PaletteRow[] = query
    ? []
    : recents
        .map((id) => commands.find((command) => command.id === id))
        .filter((command): command is EditorCommand => command !== undefined)
        .map((command) => ({ command, ranges: [] }));

  // Shown once, at the top, rather than twice — a command in both places would
  // make the list look longer than the number of things you can actually do.
  const recentIds = new Set(recentRows.map((row) => row.command.id));
  const rest = matched.filter((hit) => !recentIds.has(hit.item.id));

  const sections: PaletteSection[] = [];
  if (recentRows.length > 0) {
    sections.push({ id: RECENT_SECTION_ID, label: 'Recent', rows: recentRows });
  }
  for (const group of groupByCategory(rest, Boolean(query))) {
    sections.push({
      id: group.category,
      label: group.category,
      rows: group.items.map((hit) => ({ command: hit.item, ranges: hit.ranges })),
    });
  }
  return sections;
}

interface UseCommandPaletteOptions {
  /** Already filtered to what applies — see useEditorCommands. */
  commands: readonly EditorCommand[];
  open: boolean;
  onClose: () => void;
}

/**
 * The palette's behaviour with no opinion about its appearance: what to list
 * for the query, which row is live, and what the arrow keys do to it.
 *
 * Everything resets when it opens. A palette that reopens onto the last thing
 * you searched for is answering a question you already finished asking.
 */
export function useCommandPalette({
  commands,
  open,
  onClose,
}: UseCommandPaletteOptions): CommandPalette {
  const [query, setQueryState] = useState('');
  /**
   * The row the arrows or the pointer last chose. Null means "whatever is
   * first", which is what typing should always fall back to — so this clears
   * on every keystroke rather than following a stale choice down the list.
   */
  const [pinnedId, setPinnedId] = useState<CommandId | null>(null);
  const [recents, setRecents] = useState<readonly CommandId[]>([]);

  useEffect(() => {
    if (!open) return;
    setQueryState('');
    setPinnedId(null);
    // Re-read on each open rather than once: another tab may have run
    // something since, and storage is the only place that would show it.
    setRecents(readRecents());
  }, [open]);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setPinnedId(null);
  }, []);

  const trimmed = query.trim();

  const sections = useMemo(
    () => buildPaletteSections(commands, trimmed, recents),
    [commands, trimmed, recents],
  );

  const rows = useMemo(() => sections.flatMap((section) => section.rows), [sections]);

  // Derived rather than stored, so a pin that the current query has filtered
  // away falls back to the best match instead of leaving nothing highlighted.
  const activeId =
    (pinnedId && rows.some((row) => row.command.id === pinnedId) ? pinnedId : null) ??
    rows[0]?.command.id ??
    null;

  const run = useCallback(
    (command: EditorCommand) => {
      const next = withRecent(recents, command.id);
      setRecents(next);
      storeRecents(next);

      // Closed first so the board is clear when the command lands on it, then
      // performed in the same event — several of these open a file picker, and
      // deferring past this tick would spend the click that allows one.
      onClose();
      command.perform();
    },
    [onClose, recents],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const step = (delta: number) => {
        if (rows.length === 0) return;
        const index = rows.findIndex((row) => row.command.id === activeId);
        const next = (index + delta + rows.length) % rows.length;
        setPinnedId(rows[next]!.command.id);
      };

      switch (event.key) {
        case 'ArrowDown':
          step(1);
          break;
        case 'ArrowUp':
          step(-1);
          break;
        case 'Home':
          if (rows[0]) setPinnedId(rows[0].command.id);
          break;
        case 'End':
          if (rows.length > 0) setPinnedId(rows[rows.length - 1]!.command.id);
          break;
        case 'Enter': {
          const active = rows.find((row) => row.command.id === activeId);
          if (!active) return;
          run(active.command);
          break;
        }
        case 'Escape':
          onClose();
          break;
        default:
          return;
      }

      event.preventDefault();
      // The editor listens for these on the window, and a palette that lets
      // Escape or Enter through would act on the board behind it as well.
      event.stopPropagation();
    },
    [rows, activeId, run, onClose],
  );

  return {
    query,
    setQuery,
    sections,
    rows,
    activeId,
    setActiveId: setPinnedId,
    run,
    onKeyDown,
    noMatches: trimmed.length > 0 && rows.length === 0,
  };
}
