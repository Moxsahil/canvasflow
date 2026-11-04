import { cn } from '@/lib/utils';
import { useT } from '../i18n';
import { Icon } from '../settings/phone/icons';
import { Cta, Hint, Label } from '../settings/phone/shell';
import { ShortSheet } from '../settings/phone/ShortSheet';
import type { SurfaceTheme } from '../ui/surface-palette';
import { BOARD_COLORS } from './board-colors';
import type { BoardColor } from './workspace-api';

/**
 * Renaming a board on a phone: the name, how long it is, a way to clear it,
 * and the board's colour tag — the desktop window's two settings, as a short
 * sheet. Gray, the untagged colour, is shown as "no colour".
 */
export function PhoneRenameSheet({
  name,
  color,
  maxLength,
  loaded,
  canSave,
  busy,
  error,
  theme,
  onName,
  onColor,
  onSave,
  onClose,
}: {
  name: string;
  color: BoardColor;
  maxLength: number;
  loaded: boolean;
  canSave: boolean;
  busy: boolean;
  error: string | null;
  theme: SurfaceTheme;
  onName: (name: string) => void;
  onColor: (color: BoardColor) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <ShortSheet
      title={t('renameBoard.title')}
      sub={t('renameBoard.hint')}
      theme={theme}
      page="root"
      onClose={onClose}
      testId="phone-rename"
    >
      <div className="st-card ren-field">
        <input
          value={name}
          maxLength={maxLength}
          disabled={!loaded}
          placeholder={loaded ? t('boards.untitled') : t('common.loading')}
          aria-label={t('boards.name')}
          autoComplete="off"
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave();
          }}
          data-testid="phone-rename-input"
        />
        <span className="cnt">{`${name.length}/${maxLength}`}</span>
        {name && (
          <button
            type="button"
            className="clr"
            aria-label={t('ps.clear')}
            onClick={() => onName('')}
          >
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
      <Label>{t('boards.colourTag')}</Label>
      <div className="st-g">
        <div className="tags" role="radiogroup" aria-label={t('boards.colourTag')}>
          {BOARD_COLORS.map((option) => {
            const none = option.value === 'gray';
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={color === option.value}
                aria-label={none ? t('ps.noColour') : t(option.labelKey)}
                className={cn('tag', none && 'none', color === option.value && 'on')}
                style={none ? undefined : ({ '--c': option.swatch } as React.CSSProperties)}
                disabled={!loaded}
                onClick={() => onColor(option.value)}
                data-testid={`phone-rename-tag-${option.value}`}
              />
            );
          })}
        </div>
      </div>
      {error && <Hint error>{error}</Hint>}
      <Cta>
        <button
          type="button"
          className="st-btn"
          onClick={onSave}
          disabled={!canSave || busy}
          data-testid="phone-rename-save"
        >
          {t('common.save')}
        </button>
      </Cta>
    </ShortSheet>
  );
}
