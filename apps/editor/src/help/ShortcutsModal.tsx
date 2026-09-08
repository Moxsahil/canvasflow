import { Command } from 'lucide-react';
import { SurfaceDialog } from '../ui/SurfaceDialog';
import { SurfaceButton, SurfaceCard, SurfaceGroupLabel } from '../ui/surface-ui';
import type { SurfaceTheme } from '../ui/surface-palette';
import { SHORTCUTS, type ShortcutEntry } from './shortcuts-registry';
import { balanceColumns } from './columns';
import { formatShortcutKeys } from './platform';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

const TOTAL_SHORTCUTS = SHORTCUTS.reduce((count, category) => count + category.entries.length, 0);

/** Fixed at three: the widths below are what a row needs to stay on one line. */
const COLUMNS = balanceColumns(SHORTCUTS, 3);

/**
 * Everything the keyboard can do, in three columns.
 *
 * On the app's dialog surface like every other window, but wider than any of
 * them: the columns are what make this readable as a reference rather than a
 * list to scroll.
 *
 * The columns are evened out rather than one per category, so the dialog is as
 * tall as its fullest third instead of as tall as its longest group. Each
 * category is a labelled card of rows, as the settings panes have it — except
 * that these rows are a single line, so they are tighter than a row carrying a
 * title and a hint.
 */
export function ShortcutsModal({ open, onClose, theme }: ShortcutsModalProps) {
  return (
    <SurfaceDialog
      open={open}
      theme={theme}
      title="Keyboard shortcuts"
      subtitle={
        <span className="flex items-center gap-[5px]">
          <Command size={12} aria-hidden="true" />
          {TOTAL_SHORTCUTS} shortcuts
        </span>
      }
      leading={
        <span className="flex size-[42px] items-center justify-center rounded-full bg-[var(--surface-accent)] text-[var(--surface-on-accent)]">
          <Command className="size-[18px]" aria-hidden="true" />
        </span>
      }
      width={1020}
      onClose={onClose}
      footer={
        <>
          <div className="flex-1" />
          <SurfaceButton variant="primary" onClick={onClose}>
            Done
          </SurfaceButton>
        </>
      }
    >
      <div className="grid grid-cols-1 items-start gap-x-[18px] gap-y-[14px] sm:grid-cols-2 lg:grid-cols-3">
        {COLUMNS.map((column) => (
          <div key={column[0]?.title ?? 'empty'} className="flex flex-col gap-[8px]">
            {column.map((category) => (
              <div key={category.title} className="flex flex-col gap-[8px]">
                <SurfaceGroupLabel>{category.title}</SurfaceGroupLabel>
                <SurfaceCard>
                  {category.entries.map((entry) => (
                    <ShortcutRow key={entry.keys + entry.description} entry={entry} />
                  ))}
                </SurfaceCard>
              </div>
            ))}
          </div>
        ))}
      </div>
    </SurfaceDialog>
  );
}

/**
 * One line of the reference: what it does on the left, what to press on the
 * right. Tighter than a settings row, which carries two lines of text.
 */
function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
  const primaryKeys = formatShortcutKeys(entry.keys);
  const altKeys = entry.altKeys ? formatShortcutKeys(entry.altKeys) : null;

  return (
    <div className="flex w-full items-center gap-[10px] px-[14px] py-[7px]">
      <span className="min-w-0 flex-1 text-[12px] text-[var(--surface-fg)]">
        {entry.description}
      </span>
      <span className="inline-flex shrink-0 items-center gap-[4px]">
        <KeyPills keys={primaryKeys} />
        {altKeys && (
          <>
            <span className="text-[10px] text-[var(--surface-fg-faint)] italic">or</span>
            <KeyPills keys={altKeys} />
          </>
        )}
      </span>
    </div>
  );
}

function KeyPills({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex gap-[3px]">
      {keys.map((key, index) => (
        <kbd
          key={index}
          className="min-w-[18px] rounded-[5px] border border-[var(--surface-border)] bg-[var(--surface-raised)] px-[5px] py-[3px] text-center font-mono text-[10px] leading-none whitespace-nowrap text-[var(--surface-fg-muted)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
