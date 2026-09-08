import { useEffect, useId, useRef, useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/initials';
import { SurfaceDialog } from '../ui/SurfaceDialog';
import {
  SURFACE_INPUT_CLASS,
  SurfaceButton,
  SurfaceCard,
  SurfaceGroupLabel,
  SurfaceHint,
  SurfaceRow,
  SurfaceRowText,
} from '../ui/surface-ui';
import type { SurfaceTheme } from '../ui/surface-palette';
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
  /** The theme on screen — the dialog surface carries its own palette for each. */
  theme: SurfaceTheme;
}

/**
 * Naming a board, and tagging it with a colour.
 *
 * A dialog rather than an inline field like the one that names a workspace:
 * there are two things to set here, and the colour needs room for seven
 * swatches that a menu row cannot give it.
 *
 * On the app's dialog surface, like every other window that stops the board to
 * ask something. The header repeats the board's identity — badge, title, and a
 * second line saying what this window is for — which is the shape every one of
 * them takes.
 */
export function RenameBoardDialog({
  target,
  onOpenChange,
  onSubmit,
  busy,
  theme,
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

  const submit = () => {
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
    <SurfaceDialog
      open={target !== null}
      theme={theme}
      title={heading}
      subtitle={
        <span className="flex items-center gap-[5px]">
          <Pencil size={12} aria-hidden="true" />
          Rename and tag this board
        </span>
      }
      leading={<InitialsBadge label={heading} />}
      width={520}
      onClose={() => onOpenChange(false)}
      onSubmit={submit}
      footer={
        <>
          <div className="flex-1" />
          <SurfaceButton variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </SurfaceButton>
          <SurfaceButton variant="primary" type="submit" disabled={!canSave} loading={busy}>
            Save
          </SurfaceButton>
        </>
      }
    >
      <SurfaceGroupLabel>Board</SurfaceGroupLabel>
      <SurfaceCard>
        <SurfaceRow>
          <SurfaceRowText title="Name" hint="Shown in the sidebar" />
          <input
            id={`${fieldId}-name`}
            type="text"
            value={name}
            maxLength={MAX_BOARD_TITLE}
            // Held shut for the moment before the board's row lands, rather
            // than inviting a name that would be typed over the instant it
            // does. Ordinarily the list is already there.
            disabled={!loaded}
            placeholder={loaded ? 'Untitled board' : 'Loading…'}
            // The dialog exists to edit this field, and it is the first
            // tabbable thing inside, so nothing else claims the focus.
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(SURFACE_INPUT_CLASS, 'w-[220px] shrink-0')}
          />
        </SurfaceRow>

        <SurfaceRow>
          <SurfaceRowText title="Colour tag" hint="Marks the board at a glance" />
          {/* Real radio inputs behind the swatches, so the arrow keys move
              between colours as in any other radio group. */}
          <div
            role="radiogroup"
            aria-label="Colour tag"
            className="flex shrink-0 items-center gap-[6px]"
          >
            {BOARD_COLORS.map((option) => {
              const selected = option.value === color;
              return (
                <label
                  key={option.value}
                  title={option.label}
                  className={cn(
                    'flex size-[24px] items-center justify-center rounded-full',
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
                    // A ring rather than a border, so picking a colour doesn't
                    // change the size of the dot it lands on. Offset against
                    // the card, which is what sits behind a row.
                    className={cn(
                      'flex size-[18px] items-center justify-center rounded-full ring-offset-2 ring-offset-[var(--surface-card)] transition-shadow',
                      'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--surface-accent)]',
                      selected && 'ring-2 ring-[var(--surface-fg)]',
                    )}
                    style={{ backgroundColor: option.swatch }}
                  >
                    {selected && (
                      <Check
                        className="size-[10px] text-white"
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
        </SurfaceRow>
      </SurfaceCard>

      {error && <SurfaceHint tone="danger">{error}</SurfaceHint>}
    </SurfaceDialog>
  );
}

/**
 * The board's initials in an accent disc — the same identity mark the sidebar's
 * board rows use, so the dialog opens on something you recognise.
 */
function InitialsBadge({ label }: { label: string }) {
  return (
    <span className="flex size-[42px] items-center justify-center rounded-full bg-[var(--surface-accent)] text-[13px] font-medium text-[var(--surface-on-accent)]">
      {initialsOf(label)}
    </span>
  );
}
