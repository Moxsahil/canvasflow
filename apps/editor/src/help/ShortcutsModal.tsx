import { Command } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUTS, type ShortcutEntry } from './shortcuts-registry';
import { balanceColumns } from './columns';
import { formatShortcutKeys } from './platform';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer: HTMLElement | null;
}

const TOTAL_SHORTCUTS = SHORTCUTS.reduce((count, category) => count + category.entries.length, 0);

/** Fixed at three: the widths below are what a row needs to stay on one line. */
const COLUMNS = balanceColumns(SHORTCUTS, 3);

/**
 * Everything the keyboard can do, in three columns.
 *
 * Built as the share and sidebar dialogs are — a Card carried by a dialog
 * stripped to nothing — on a wider card than those, because the columns are
 * what make this readable as a reference rather than a list to scroll.
 *
 * The columns are evened out rather than one per category, so the dialog is as
 * tall as its fullest third instead of as tall as its longest group. Whatever
 * is left over scrolls inside the card, under a heading and above a button that
 * both stay put — the height is capped, so there is always a way down to the
 * rest and always a way out.
 *
 * The ordinary dialog rather than the alert one: this is something you opened
 * to read, so clicking away from it dismisses it. Escape and the focus trap are
 * Radix's; the editor's own shortcuts are held off while it is open.
 */
export function ShortcutsModal({ open, onClose, portalContainer }: ShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        container={portalContainer}
        showClose={false}
        aria-describedby={undefined}
        className="max-h-[85vh] w-[min(100%-2rem,64rem)] overflow-y-hidden border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">Keyboard shortcuts</DialogTitle>

        <Card className="flex w-full min-h-0 flex-col">
          <CardHeader className="shrink-0 gap-1 space-y-0 pb-4">
            <CardTitle className="truncate text-lg font-semibold">Keyboard shortcuts</CardTitle>
            <p className="flex items-center gap-1 text-sm text-muted-foreground">
              <Command size={14} />
              {TOTAL_SHORTCUTS} shortcuts
            </p>
          </CardHeader>

          <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-8 gap-y-6 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {COLUMNS.map((column) => (
                <div key={column[0]?.title ?? 'empty'} className="flex flex-col gap-5">
                  {column.map((category) => (
                    <div key={category.title} className="flex flex-col gap-2">
                      <h3 className="text-sm font-medium text-foreground">{category.title}</h3>
                      <div className="flex flex-col gap-1">
                        {category.entries.map((entry) => (
                          <ShortcutRow key={entry.keys + entry.description} entry={entry} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex shrink-0 justify-end border-t border-border pt-4">
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutRow({ entry }: { entry: ShortcutEntry }) {
  const primaryKeys = formatShortcutKeys(entry.keys);
  const altKeys = entry.altKeys ? formatShortcutKeys(entry.altKeys) : null;

  return (
    <div className="flex items-center justify-between gap-3 text-sm text-foreground">
      <span className="min-w-0 flex-1">{entry.description}</span>
      <span className="inline-flex shrink-0 items-center gap-1">
        <KeyPills keys={primaryKeys} />
        {altKeys && (
          <>
            <span className="text-[0.6875rem] italic text-muted-foreground">or</span>
            <KeyPills keys={altKeys} />
          </>
        )}
      </span>
    </div>
  );
}

function KeyPills({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {keys.map((key, index) => (
        <kbd
          key={index}
          className="min-w-5 rounded-md border border-border bg-muted px-1.5 py-1 text-center font-mono text-[0.6875rem] leading-none whitespace-nowrap text-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
