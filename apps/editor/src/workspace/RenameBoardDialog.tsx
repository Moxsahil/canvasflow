import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { initialsOf } from '@/lib/initials';
import { BOARD_COLORS } from './board-colors';
import type { RenameBoardTarget } from './useBoardSwitcher';
import type { BoardColor, BoardDetailsPatch } from './workspace-api';

const MAX_BOARD_TITLE = 200;

interface RenameBoardDialogProps {
  /** The board being renamed, or null when the dialog is closed. */
  target: RenameBoardTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Rejects when the server refuses; the dialog then stays open. */
  onSubmit: (boardId: string, patch: BoardDetailsPatch) => Promise<void>;
  busy: boolean;
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer: HTMLElement | null;
}

/**
 * Naming a board, and tagging it with a colour.
 *
 * A dialog rather than an inline field like the one that names a workspace:
 * there are two things to set here, and the colour needs room for seven
 * swatches that a menu row cannot give it.
 *
 * Built as the share dialog is — a Card carried by a dialog stripped to
 * nothing, so the card itself is the surface — because those two are the only
 * dialogs the sidebar opens and they have to read as one application. That is
 * also why the header repeats the board's identity the way the share card
 * repeats the team's: same badge, same title, same second line.
 */
export function RenameBoardDialog({
  target,
  onOpenChange,
  onSubmit,
  busy,
  portalContainer,
}: RenameBoardDialogProps) {
  const fieldId = useId();
  const [name, setName] = useState('');
  const [color, setColor] = useState<BoardColor>('gray');
  // Held here rather than read off the switcher: opening this closes the menu
  // that shows the switcher's own error line, so a failure would go unseen.
  const [error, setError] = useState<string | null>(null);

  // Which board the fields currently hold. The dialog is one element reused
  // for every row in the list, and its target can arrive empty and fill in a
  // moment later — so seeding is keyed on the board rather than on the target
  // object, which would re-seed over whatever had just been typed.
  const seededFor = useRef<string | null>(null);

  const loaded = target !== null && target.title !== null;

  useEffect(() => {
    if (!target) {
      seededFor.current = null;
      return;
    }

    const { boardId, title, color: tagged } = target;
    if (title === null || seededFor.current === boardId) return;

    seededFor.current = boardId;
    setName(title);
    setColor(tagged ?? 'gray');
    setError(null);
  }, [target]);

  const trimmed = name.trim();
  const renamed = Boolean(trimmed) && trimmed !== target?.title;
  const recoloured = target?.color != null && color !== target.color;
  const canSave = loaded && Boolean(trimmed) && (renamed || recoloured);

  // The board as it stands, not as it is being typed: this is the heading, and
  // a heading that changes under the field editing it is unsettling.
  const heading = target?.title ?? 'Board';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!target || !canSave || busy) return;

    const patch: BoardDetailsPatch = {};
    if (renamed) patch.title = trimmed;
    if (recoloured) patch.color = color;

    setError(null);
    onSubmit(target.boardId, patch).then(
      () => onOpenChange(false),
      // Left open on failure, so the typed name is still there to retry with.
      (err: unknown) => setError(err instanceof Error ? err.message : 'Something went wrong.'),
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent
        container={portalContainer}
        showClose={false}
        aria-describedby={undefined}
        className="w-[min(100%-2rem,32rem)] border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">Rename board</DialogTitle>

        <Card className="w-full max-w-lg">
          <form onSubmit={handleSubmit}>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary text-sm font-medium text-primary-foreground">
                      {initialsOf(heading)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-lg font-semibold">{heading}</CardTitle>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Pencil size={14} />
                    Rename and tag this board
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <Label htmlFor={`${fieldId}-name`} className="font-medium">
                  Board name
                </Label>
                <Input
                  id={`${fieldId}-name`}
                  value={name}
                  maxLength={MAX_BOARD_TITLE}
                  // Held shut for the moment before the board's row lands,
                  // rather than inviting a name that would be typed over the
                  // instant it does. Ordinarily the list is already there.
                  disabled={!loaded}
                  placeholder={loaded ? 'Untitled board' : 'Loading…'}
                  // The dialog exists to edit this field, and it is the first
                  // tabbable thing inside, so nothing else claims the focus.
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>

              <div className="flex flex-col gap-4">
                <Label id={`${fieldId}-color`} className="font-medium">
                  Colour tag
                </Label>
                {/* Real radio inputs behind the swatches, so the arrow keys
                    move between colours as in any other radio group. */}
                <div
                  role="radiogroup"
                  aria-labelledby={`${fieldId}-color`}
                  className="flex flex-wrap items-center gap-3"
                >
                  {BOARD_COLORS.map((option) => {
                    const selected = option.value === color;
                    return (
                      <label
                        key={option.value}
                        title={option.label}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full',
                          loaded ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <input
                          type="radio"
                          name={`${fieldId}-color-input`}
                          value={option.value}
                          checked={selected}
                          disabled={!loaded}
                          onChange={() => setColor(option.value)}
                          className="peer sr-only"
                        />
                        <span
                          // A ring rather than a border, so picking a colour
                          // doesn't change the size of the dot it lands on.
                          className={cn(
                            'flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-shadow',
                            'peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                            selected && 'ring-2 ring-foreground',
                          )}
                          style={{ backgroundColor: option.swatch }}
                        >
                          {selected && (
                            <Check
                              className="size-3.5 text-white"
                              strokeWidth={3}
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="sr-only">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSave || busy} loading={busy}>
                  Save
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
