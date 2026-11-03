import { cn } from '@/lib/utils';
import { useT, type TranslationKey } from '../i18n';
import { ACCENTS, ACCENT_IDS, setAccent, useAccent, type AccentId } from '../theme/accent';
import { StackedField } from './settings-ui';

const ACCENT_NAMES: Readonly<Record<AccentId, TranslationKey>> = {
  blue: 'ps.accent.blue',
  violet: 'ps.accent.violet',
  green: 'ps.accent.green',
  orange: 'ps.accent.orange',
  pink: 'ps.accent.pink',
  slate: 'ps.accent.slate',
};

/**
 * The accent colour, under the cursor colour on Profile.
 *
 * Kept on the device rather than the account, the same choice the phone's
 * Settings makes, so picking one here shows there too, and a guest can pick one.
 */
export function AccentColour() {
  const t = useT();
  const accent = useAccent();
  return (
    <StackedField setting="accent-colour" label={t('ps.accent')} hint={t('ps.accentHint')}>
      <div
        role="radiogroup"
        aria-label={t('ps.accent')}
        className="flex items-center gap-[8px] py-[3px] pl-[3px]"
      >
        {ACCENT_IDS.map((id) => {
          const selected = id === accent;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(ACCENT_NAMES[id])}
              onClick={() => setAccent(id)}
              style={{ backgroundColor: ACCENTS[id].strong }}
              // Drawn like the cursor colours on Profile: the ring sits
              // outside the circle, in the foreground colour.
              className={cn(
                'size-[20px] rounded-full ring-offset-2 ring-offset-[var(--surface-panel)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--surface-accent)]',
                selected && 'ring-2 ring-[var(--surface-fg)]',
              )}
              data-testid={`settings-accent-${id}`}
            />
          );
        })}
      </div>
    </StackedField>
  );
}
