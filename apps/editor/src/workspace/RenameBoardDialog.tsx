import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { INPUT } from '../settings/settings-ui';
import {
  SurfaceWindow,
  WindowBody,
  WindowButton,
  WindowFooter,
  WindowHeader,
} from '../ui/SurfaceWindow';
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
 * A window rather than an inline field like the one that names a workspace:
 * there are two things to set here, and the colour needs room for seven
 * swatches that a row cannot give it. Opened over Manage it stacks on top, and
 * Manage is still there when it closes.
 */
export function RenameBoardDialog({
  target,
  onOpenChange,
  onSubmit,
  busy,
  theme,
}: RenameBoardDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
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
    <SurfaceWindow
      open={target !== null}
      theme={theme}
      onClose={() => onOpenChange(false)}
      width={420}
      labelledBy={titleId}
      describedBy={descriptionId}
      onSubmit={submit}
      data-testid="rename-board-dialog"
    >
      <WindowHeader
        titleId={titleId}
        title="Rename board"
        description="A name and a colour tag, as the sidebar shows it."
        descriptionId={descriptionId}
        onClose={() => onOpenChange(false)}
      />

      <WindowBody>
        <input
          id={fieldId}
          type="text"
          value={name}
          maxLength={MAX_BOARD_TITLE}
          aria-label="Board name"
          // Held shut for the moment before the board's row lands, rather
          // than inviting a name that would be typed over the instant it
          // does. Ordinarily the list is already there.
          disabled={!loaded}
          placeholder={loaded ? 'Untitled board' : 'Loading…'}
          // The window exists to edit this field.
          autoFocus
          data-autofocus
          onChange={(event) => setName(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          className={INPUT}
        />

        {/* Real radio inputs behind the swatches, so the arrow keys move
            between colours as in any other radio group. */}
        <div role="radiogroup" aria-label="Colour tag" className="flex items-center gap-[8px]">
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
                  name={`${fieldId}-color`}
                  value={option.value}
                  checked={selected}
                  disabled={!loaded}
                  onChange={() => setColor(option.value)}
                  className="peer sr-only"
                />
                {/* A ring rather than a border, so picking a colour doesn't
                    change the size of the dot it lands on. */}
                <span
                  className={cn(
                    'flex size-[20px] items-center justify-center rounded-full ring-offset-2 ring-offset-[var(--surface-panel)] transition-shadow',
                    'peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--surface-accent)]',
                    selected && 'ring-2 ring-[var(--surface-fg)]',
                  )}
                  style={{ backgroundColor: option.swatch }}
                >
                  {selected && (
                    <Check className="size-[11px] text-white" strokeWidth={3} aria-hidden="true" />
                  )}
                </span>
                <span className="sr-only">{option.label}</span>
              </label>
            );
          })}
        </div>
      </WindowBody>

      <WindowFooter status={error} danger>
        <WindowButton variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </WindowButton>
        <WindowButton variant="primary" type="submit" disabled={!canSave || busy}>
          {busy ? 'Saving…' : 'Save'}
        </WindowButton>
      </WindowFooter>
    </SurfaceWindow>
  );
}
