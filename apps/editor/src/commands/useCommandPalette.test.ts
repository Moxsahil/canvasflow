import { describe, expect, it } from 'vitest';
import { Command } from 'lucide-react';
import { buildPaletteSections, RECENT_SECTION_ID } from './useCommandPalette';
import type { CommandCategory, CommandId } from './commands';
import type { EditorCommand } from './useEditorCommands';

const noop = () => {};

function command(id: string, label: string, category: CommandCategory): EditorCommand {
  return {
    id: id as CommandId,
    label,
    category,
    icon: Command,
    perform: noop,
  };
}

const commands: EditorCommand[] = [
  command('tool:rectangle', 'Rectangle', 'Tools'),
  command('tool:ellipse', 'Ellipse', 'Tools'),
  command('zoomToFit', 'Zoom to fit', 'View'),
  command('undo', 'Undo', 'Edit'),
  command('copy', 'Copy selection', 'Edit'),
  command('exportImage', 'Export image…', 'Board'),
];

const labelsIn = (sections: ReturnType<typeof buildPaletteSections>, id: string) =>
  sections.find((section) => section.id === id)?.rows.map((row) => row.command.label) ?? [];

describe('buildPaletteSections without a query', () => {
  it('lists every command, grouped into its category', () => {
    const sections = buildPaletteSections(commands, '', []);
    expect(sections.map((section) => section.id)).toEqual(['Tools', 'View', 'Edit', 'Board']);
    expect(sections.flatMap((section) => section.rows)).toHaveLength(commands.length);
  });

  it('puts recents in their own section, ahead of everything else', () => {
    const sections = buildPaletteSections(commands, '', ['undo', 'zoomToFit']);
    expect(sections[0]!.id).toBe(RECENT_SECTION_ID);
    expect(labelsIn(sections, RECENT_SECTION_ID)).toEqual(['Undo', 'Zoom to fit']);
  });

  it('does not also leave a recent command in its own category', () => {
    const sections = buildPaletteSections(commands, '', ['undo']);
    expect(labelsIn(sections, 'Edit')).toEqual(['Copy selection']);
    expect(sections.flatMap((section) => section.rows)).toHaveLength(commands.length);
  });

  it('drops a recent that is not currently available', () => {
    // 'paste' is not in `commands` — the same shape as a command filtered out
    // because nothing is selected, or because the board is read-only.
    const sections = buildPaletteSections(commands, '', ['paste' as CommandId, 'undo']);
    expect(labelsIn(sections, RECENT_SECTION_ID)).toEqual(['Undo']);
  });

  it('leaves out the recent section entirely when there are none', () => {
    const sections = buildPaletteSections(commands, '', []);
    expect(sections.map((section) => section.id)).not.toContain(RECENT_SECTION_ID);
  });

  it('reports no highlight ranges, since nothing was searched for', () => {
    const sections = buildPaletteSections(commands, '', ['undo']);
    for (const row of sections.flatMap((section) => section.rows)) {
      expect(row.ranges).toEqual([]);
    }
  });
});

describe('buildPaletteSections with a query', () => {
  it('drops the recents, because ranking is the point once you type', () => {
    const sections = buildPaletteSections(commands, 'zoom', ['undo']);
    expect(sections.map((section) => section.id)).not.toContain(RECENT_SECTION_ID);
  });

  it('keeps only what matches', () => {
    const sections = buildPaletteSections(commands, 'ellip', []);
    expect(sections.flatMap((section) => section.rows.map((row) => row.command.label))).toEqual([
      'Ellipse',
    ]);
  });

  it('leads with the category holding the best match rather than the fixed order', () => {
    const sections = buildPaletteSections(commands, 'undo', []);
    expect(sections[0]!.id).toBe('Edit');
  });

  it('carries the ranges that matched, for the view to emphasise', () => {
    const sections = buildPaletteSections(commands, 'undo', []);
    expect(sections[0]!.rows[0]!.ranges).toEqual([[0, 4]]);
  });

  it('returns nothing at all when the query matches nothing', () => {
    expect(buildPaletteSections(commands, 'zzzz', ['undo'])).toEqual([]);
  });

  it('still finds a command when the query spans words it does not spell', () => {
    const sections = buildPaletteSections(commands, 'zoom fit', []);
    expect(sections.flatMap((section) => section.rows.map((row) => row.command.label))).toEqual([
      'Zoom to fit',
    ]);
  });
});
