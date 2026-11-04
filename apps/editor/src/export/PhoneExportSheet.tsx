import { cn } from '@/lib/utils';
import { useT, type TranslationKey } from '../i18n';
import { Icon } from '../settings/phone/icons';
import { Cta, Group, Hint, Label, SwitchRow } from '../settings/phone/shell';
import { ShortSheet } from '../settings/phone/ShortSheet';
import type { SurfaceTheme } from '../ui/surface-palette';
import { EXPORT_SCALES } from '../file/export-image';

type Format = 'png' | 'svg';

const SCALE_CAPTIONS: Record<(typeof EXPORT_SCALES)[number], TranslationKey> = {
  1: 'ps.export.scale1',
  2: 'ps.export.scale2',
  3: 'ps.export.scale3',
};

/**
 * Export image on a phone: the desktop window's preview, format, scale and
 * four switches, as a sheet — the picture on top with its size, each choice
 * with a line saying what it is for, the file's name, then Copy, Save and,
 * where the phone has one, its share sheet.
 */
export function PhoneExportSheet(props: {
  boardName: string;
  theme: SurfaceTheme;
  preview: string | null;
  empty: boolean;
  dimensions: { width: number; height: number } | null;
  format: Format;
  scale: number;
  hasSelection: boolean;
  selectedCount: number;
  selectionOnly: boolean;
  withBackground: boolean;
  dark: boolean;
  embedScene: boolean;
  name: string;
  busy: boolean;
  error: string | null;
  canShare: boolean;
  onFormat: (format: Format) => void;
  onScale: (scale: number) => void;
  onSelectionOnly: (on: boolean) => void;
  onBackground: (on: boolean) => void;
  onDark: (on: boolean) => void;
  onEmbed: (on: boolean) => void;
  onName: (name: string) => void;
  onCopy: () => void;
  onSave: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const svg = props.format === 'svg';
  const off = props.empty || props.busy;

  return (
    <ShortSheet
      title={t('ps.export.title')}
      sub={props.boardName}
      theme={props.theme}
      page="root"
      onClose={props.onClose}
      testId="phone-export"
    >
      <div
        className={cn('xp-prev', !props.withBackground && 'checker', !props.dark && 'light')}
        aria-live="polite"
      >
        {props.preview ? (
          <img src={props.preview} alt={t('export.preview')} />
        ) : (
          <span className="st-hint">
            {props.empty ? t('ps.export.nothing') : t('export.preparing')}
          </span>
        )}
        {props.dimensions && (
          <div className="xp-badge">
            <span>{`${props.dimensions.width} × ${props.dimensions.height}`}</span>
          </div>
        )}
      </div>

      <Label>{t('ps.export.format')}</Label>
      <Segments
        label={t('ps.export.format')}
        options={['png', 'svg'] as const}
        value={props.format}
        show={(choice) => choice.toUpperCase()}
        onChange={props.onFormat}
      />
      <div className="xp-cap">{svg ? t('ps.export.svgCap') : t('ps.export.pngCap')}</div>

      <Label>{t('export.scale')}</Label>
      <Segments
        label={t('export.scaleLabel')}
        options={EXPORT_SCALES}
        value={props.scale as (typeof EXPORT_SCALES)[number]}
        show={(choice) => `${choice}×`}
        onChange={props.onScale}
      />
      <div className="xp-cap">
        {t(SCALE_CAPTIONS[props.scale as (typeof EXPORT_SCALES)[number]] ?? 'ps.export.scale1')}
      </div>

      <Label>{t('ps.export.include')}</Label>
      <Group noIcons>
        <SwitchRow
          label={t('export.onlySelection')}
          hint={
            props.hasSelection
              ? t('ps.export.selected', { count: props.selectedCount })
              : t('export.nothingSelected')
          }
          on={props.selectionOnly}
          onToggle={
            props.hasSelection ? () => props.onSelectionOnly(!props.selectionOnly) : undefined
          }
        />
        <SwitchRow
          label={t('export.background')}
          hint={t('export.backgroundHint')}
          on={props.withBackground}
          onToggle={() => props.onBackground(!props.withBackground)}
        />
        <SwitchRow
          label={t('export.dark')}
          hint={props.dark ? t('export.darkHint') : t('ps.export.lightHint')}
          on={props.dark}
          onToggle={() => props.onDark(!props.dark)}
        />
        <SwitchRow
          label={t('export.embed')}
          hint={t('export.embedHint')}
          on={props.embedScene}
          onToggle={() => props.onEmbed(!props.embedScene)}
        />
      </Group>

      <Label>{t('ps.export.fileName')}</Label>
      <Group noIcons>
        <label className="st-r st-field">
          <input
            value={props.name}
            onChange={(event) => props.onName(event.target.value)}
            aria-label={t('ps.export.fileName')}
            autoComplete="off"
            style={{ textAlign: 'left' }}
            data-testid="phone-export-name"
          />
          <span className="end">
            <span>{`.${props.embedScene ? 'canvasflow.' : ''}${props.format}`}</span>
          </span>
        </label>
      </Group>
      {props.error && <Hint error>{props.error}</Hint>}

      <Cta>
        <div className={cn('xp-acts', !props.canShare && 'two')}>
          <button
            type="button"
            className="st-btn ghost"
            onClick={props.onCopy}
            disabled={off}
            data-testid="phone-export-copy"
          >
            <Icon name="copy" size={19} />
            {t('export.copy')}
          </button>
          <button
            type="button"
            className="st-btn main"
            onClick={props.onSave}
            disabled={off}
            data-testid="phone-export-save"
          >
            <Icon name="download" size={19} />
            {svg ? t('ps.export.saveSvg') : t('ps.export.savePng')}
          </button>
          {props.canShare && (
            <button
              type="button"
              className="st-btn ghost"
              onClick={props.onShare}
              disabled={off}
              data-testid="phone-export-share"
            >
              <Icon name="share" size={19} />
              {t('ps.share.shareVia')}
            </button>
          )}
        </div>
      </Cta>
    </ShortSheet>
  );
}

function Segments<T extends string | number>({
  label,
  options,
  value,
  show,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly T[];
  value: T;
  show: (choice: T) => string;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="st-seg"
      style={{ margin: 0, ...(disabled ? { opacity: 0.4 } : {}) }}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      {options.map((choice) => (
        <button
          key={choice}
          type="button"
          role="radio"
          aria-checked={choice === value}
          className={choice === value ? 'on' : undefined}
          disabled={disabled}
          onClick={() => onChange(choice)}
          data-testid={`phone-export-${String(choice)}`}
        >
          {show(choice)}
        </button>
      ))}
    </div>
  );
}
