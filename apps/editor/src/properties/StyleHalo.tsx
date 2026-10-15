import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  Layers,
  MoveDown,
  MoveUp,
} from 'lucide-react';
import { strokeColorFor } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import {
  menuButtonRowClasses,
  menuChipClasses,
  menuSurfaceClasses,
} from '@/components/ui/menu-look';
import { ColorPickerPopover } from './color/ColorPickerPopover';
import { haloPlacement, type ScreenRect, type Size } from './halo-placement';
import {
  InspectorPopover,
  InspectorRow,
  PercentControl,
  SegmentedControl,
  StepperControl,
  Swatch,
} from './inspector';
import { RoundEdgeIcon, SharpEdgeIcon } from './icons';
import { BACKGROUND_SWATCHES, STROKE_SWATCHES } from './palette';
import type { StyleSurfaceProps } from './PropertiesPanel';
import {
  ALIGN_OPTIONS,
  ARROW_TYPE_OPTIONS,
  ArrowheadGrid,
  DASH_OPTIONS,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LOOK_OPTIONS,
  PATTERN_OPTIONS,
  PRESSURE_OPTIONS,
  WEIGHT_STEPS,
} from './style-options';
import { styleSections } from './style-sections';
import { useT } from '../i18n';

type HaloMenu = 'stroke' | 'fill' | 'line' | 'look' | 'arrow' | 'text' | 'opacity' | 'arrange';

interface StyleHaloProps extends StyleSurfaceProps {
  /** The selection's box on the board, or null with nothing selected. */
  anchor: ScreenRect | null;
  board: Size;
  /** Put away mid-gesture, while the selection is on the move. */
  hidden: boolean;
  /**
   * Told where the bar stands whenever that changes, and null once it is
   * away, so what else floats by the selection can keep clear of it.
   */
  onPlace?: (rect: ScreenRect | null) => void;
}

function Separator() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 h-4 w-px shrink-0 bg-neutral-300 dark:bg-neutral-600"
    />
  );
}

function Chevron() {
  return (
    <ChevronDown
      aria-hidden="true"
      className="size-2.5! shrink-0 text-neutral-500 dark:text-neutral-400"
    />
  );
}

/**
 * The style controls as one slim bar floating over the selection, each chip
 * opening a small menu of its own. The alternative to the docked panel,
 * chosen in preferences: the same sections, the same controls, the same
 * rules for what applies — see `styleSections` — set out where the eye
 * already is rather than at the edge of the screen.
 */
export function StyleHalo({
  style,
  shapeKinds,
  canReorder,
  onStyleChange,
  layerActions,
  darkMode,
  anchor,
  board,
  hidden,
  onPlace,
}: StyleHaloProps) {
  const t = useT();
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [open, setOpen] = useState<{ menu: HaloMenu; trigger: HTMLElement } | null>(null);

  // Measured when the bar appears and again whenever its size changes — which
  // chips show depends on what is selected, and that sets its width.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (hidden || !bar) return;
    const measure = () => {
      const next = { width: bar.offsetWidth, height: bar.offsetHeight };
      setSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [hidden]);

  // A menu left open over a drag would come back where the selection was.
  useEffect(() => {
    if (hidden) setOpen(null);
  }, [hidden]);

  const place = haloPlacement(anchor, size, board);
  // Only once measured: before that the bar stands nowhere in particular.
  const placed = !hidden && size.width > 0;
  useLayoutEffect(() => {
    onPlace?.(placed ? { x: place.left, y: place.top, ...size } : null);
  }, [onPlace, placed, place.left, place.top, size]);
  useLayoutEffect(() => () => onPlace?.(null), [onPlace]);

  if (hidden) return null;

  const show = styleSections(shapeKinds, style);
  const paintStroke = (colour: string) => strokeColorFor(colour, darkMode);

  const toggle = (menu: HaloMenu) => (event: MouseEvent<HTMLButtonElement>) => {
    const trigger = event.currentTarget;
    setOpen((current) => (current?.menu === menu ? null : { menu, trigger }));
  };
  const close = () => setOpen(null);
  const chipState = (menu: HaloMenu) => ({
    'aria-haspopup': 'dialog' as const,
    'aria-expanded': open?.menu === menu,
    onClick: toggle(menu),
  });

  /**
   * Beside the chip that opened it, on whichever side of the bar has more
   * room. A chip right of centre lines its menu up by the right edge, so the
   * menus of the last chips don't run off past the bar.
   */
  const menuPosition = (): CSSProperties => {
    if (!open) return {};
    const { trigger } = open;
    const vertical: CSSProperties = place.opensUp
      ? { bottom: 'calc(100% + 6px)' }
      : { top: 'calc(100% + 6px)' };
    const centre = trigger.offsetLeft + trigger.offsetWidth / 2;
    return centre > size.width / 2
      ? { ...vertical, right: size.width - (trigger.offsetLeft + trigger.offsetWidth) }
      : { ...vertical, left: trigger.offsetLeft };
  };

  const menu = (title: string, children: ReactNode, className = 'w-60') =>
    open && (
      <InspectorPopover
        title={title}
        position={menuPosition()}
        trigger={open.trigger}
        onClose={close}
        className={cn('p-1 pb-1.5', className)}
      >
        {children}
      </InspectorPopover>
    );

  return (
    <div
      className="absolute z-(--zIndex-layerUI)"
      // Unseen until measured, so its first frame isn't drawn in the wrong place.
      style={{ left: place.left, top: place.top, visibility: size.width ? undefined : 'hidden' }}
    >
      <div
        ref={barRef}
        role="group"
        aria-label={t('style.style')}
        data-testid="style-halo"
        className={cn(menuSurfaceClasses, 'flex items-center gap-0.5 rounded-card p-0.75')}
      >
        <button
          type="button"
          title={show.textOnly ? t('style.textColour') : t('style.strokeColour')}
          aria-label={`${show.textOnly ? t('style.textColour') : t('style.strokeColour')}: ${style.strokeColor}`}
          className={menuChipClasses}
          {...chipState('stroke')}
        >
          <Swatch
            value={style.strokeColor}
            paint={paintStroke(style.strokeColor)}
            className="size-4 rounded-full"
          />
          <Chevron />
        </button>
        {show.fill && (
          <button
            type="button"
            title={t('style.fill')}
            aria-label={`${t('style.fillColour')}: ${style.fillColor ?? t('style.noneLower')}`}
            className={menuChipClasses}
            {...chipState('fill')}
          >
            <Swatch
              value={style.fillColor}
              paint={style.fillColor}
              className="size-4 rounded-full"
            />
            <Chevron />
          </button>
        )}

        <Separator />

        {show.textOnly && (
          <button
            type="button"
            title={t('style.text')}
            aria-label={t('style.textStyle')}
            className={menuChipClasses}
            {...chipState('text')}
          >
            <span style={{ fontFamily: style.fontFamily, fontSize: 13 }}>Aa</span>
            <Chevron />
          </button>
        )}
        {show.stroke && (
          <button
            type="button"
            title={t('style.line')}
            aria-label={t('style.line')}
            className={menuChipClasses}
            {...chipState('line')}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
            >
              <path
                d="M4 12h16"
                strokeWidth={Math.min(4, 1 + style.strokeWidth * 0.6)}
                strokeDasharray={
                  style.strokeStyle === 'dashed'
                    ? '4 3.5'
                    : style.strokeStyle === 'dotted'
                      ? '0.1 4'
                      : undefined
                }
              />
            </svg>
            <Chevron />
          </button>
        )}
        {show.strokeTreatments && (
          <button
            type="button"
            title={t('style.look')}
            aria-label={t('style.look')}
            className={menuChipClasses}
            {...chipState('look')}
          >
            {LOOK_OPTIONS.find((option) => option.value === style.roughness)?.icon}
            <Chevron />
          </button>
        )}
        {show.corners && (
          <button
            type="button"
            title={t('style.roundedCorners')}
            aria-label={t('style.roundedCorners')}
            aria-pressed={style.edges === 'round'}
            className={menuChipClasses}
            onClick={() => onStyleChange({ edges: style.edges === 'round' ? 'sharp' : 'round' })}
          >
            {style.edges === 'round' ? <RoundEdgeIcon /> : <SharpEdgeIcon />}
          </button>
        )}
        {show.arrow && (
          <button
            type="button"
            title={t('style.arrow')}
            aria-label={t('style.arrow')}
            className={menuChipClasses}
            {...chipState('arrow')}
          >
            {ARROW_TYPE_OPTIONS.find((option) => option.value === style.arrowType)?.icon}
            <Chevron />
          </button>
        )}

        <Separator />

        <button
          type="button"
          title={t('style.opacity')}
          aria-label={`${t('style.opacity')}: ${style.opacity}%`}
          className={menuChipClasses}
          {...chipState('opacity')}
        >
          <span>{style.opacity}%</span>
          <Chevron />
        </button>
        {canReorder && (
          <button
            type="button"
            title={t('style.arrange')}
            aria-label={t('style.arrange')}
            className={menuChipClasses}
            {...chipState('arrange')}
          >
            <Layers aria-hidden="true" />
            <Chevron />
          </button>
        )}
      </div>

      {(open?.menu === 'stroke' || open?.menu === 'fill') && (
        <ColorPickerPopover
          key={open.menu}
          title={
            open.menu === 'fill'
              ? t('style.fillColour')
              : show.textOnly
                ? t('style.textColour')
                : t('style.strokeColour')
          }
          value={open.menu === 'stroke' ? style.strokeColor : style.fillColor}
          swatches={open.menu === 'stroke' ? STROKE_SWATCHES : BACKGROUND_SWATCHES}
          paint={open.menu === 'stroke' ? paintStroke : undefined}
          position={menuPosition()}
          trigger={open.trigger}
          extra={
            open.menu === 'fill' &&
            show.fillPattern && (
              <InspectorRow label={t('style.pattern')}>
                <SegmentedControl
                  label={t('style.fillPattern')}
                  value={style.fillStyle}
                  options={PATTERN_OPTIONS}
                  onChange={(fillStyle) => onStyleChange({ fillStyle })}
                />
              </InspectorRow>
            )
          }
          onChange={(next, transient) =>
            onStyleChange(
              open.menu === 'stroke'
                ? // Stroke has no transparent state, so a cleared value is ignored.
                  { strokeColor: next ?? style.strokeColor }
                : { fillColor: next },
              transient,
            )
          }
          onClose={close}
        />
      )}

      {open?.menu === 'line' &&
        menu(
          t('style.line'),
          <>
            <InspectorRow label={t('style.weight')}>
              <StepperControl
                label={t('style.strokeWeight')}
                value={style.strokeWidth}
                steps={WEIGHT_STEPS}
                format={(width) => `${width} px`}
                decreaseLabel={t('style.thinner')}
                increaseLabel={t('style.thicker')}
                onChange={(strokeWidth) => onStyleChange({ strokeWidth })}
              />
            </InspectorRow>
            {show.strokeTreatments && (
              <InspectorRow label={t('style.dash')}>
                <SegmentedControl
                  label={t('style.strokeDash')}
                  value={style.strokeStyle}
                  options={DASH_OPTIONS}
                  onChange={(strokeStyle) => onStyleChange({ strokeStyle })}
                />
              </InspectorRow>
            )}
            {show.pressure && (
              <InspectorRow label={t('style.pressure')}>
                <SegmentedControl
                  label={t('style.pressure')}
                  value={style.simulatePressure ? 'tapered' : 'constant'}
                  options={PRESSURE_OPTIONS}
                  onChange={(pressure) =>
                    onStyleChange({ simulatePressure: pressure === 'tapered' })
                  }
                />
              </InspectorRow>
            )}
          </>,
        )}

      {open?.menu === 'look' &&
        menu(
          t('style.look'),
          <InspectorRow label={t('style.style')}>
            <SegmentedControl
              label={t('style.look')}
              value={style.roughness}
              options={LOOK_OPTIONS}
              onChange={(roughness) => onStyleChange({ roughness })}
            />
          </InspectorRow>,
        )}

      {open?.menu === 'arrow' &&
        menu(
          t('style.arrow'),
          <>
            <InspectorRow label={t('style.type')}>
              <SegmentedControl
                label={t('style.arrowType')}
                value={style.arrowType}
                options={ARROW_TYPE_OPTIONS}
                onChange={(arrowType) => onStyleChange({ arrowType })}
              />
            </InspectorRow>
            <p className="m-0 px-2 pt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
              {t('style.start')}
            </p>
            <ArrowheadGrid
              end="start"
              columns={5}
              value={style.startArrowhead}
              onPick={(startArrowhead) => onStyleChange({ startArrowhead })}
            />
            <p className="m-0 px-2 pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              {t('style.end')}
            </p>
            <ArrowheadGrid
              end="end"
              columns={5}
              value={style.endArrowhead}
              onPick={(endArrowhead) => onStyleChange({ endArrowhead })}
            />
          </>,
        )}

      {open?.menu === 'text' &&
        menu(
          t('style.text'),
          <>
            <InspectorRow label={t('style.font')}>
              <SegmentedControl
                label={t('style.font')}
                value={style.fontFamily}
                options={FONT_OPTIONS}
                onChange={(fontFamily) => onStyleChange({ fontFamily })}
              />
            </InspectorRow>
            <InspectorRow label={t('style.size')}>
              <SegmentedControl
                label={t('style.fontSize')}
                value={style.fontSize}
                options={FONT_SIZE_OPTIONS}
                onChange={(fontSize) => onStyleChange({ fontSize })}
              />
            </InspectorRow>
            <InspectorRow label={t('style.align')}>
              <SegmentedControl
                label={t('style.textAlign')}
                value={style.textAlign}
                options={ALIGN_OPTIONS}
                onChange={(textAlign) => onStyleChange({ textAlign })}
              />
            </InspectorRow>
          </>,
        )}

      {open?.menu === 'opacity' &&
        menu(
          t('style.opacity'),
          <InspectorRow label={t('style.opacity')}>
            <PercentControl
              label={t('style.opacity')}
              value={style.opacity}
              onChange={(opacity) => onStyleChange({ opacity })}
            />
          </InspectorRow>,
        )}

      {open?.menu === 'arrange' &&
        menu(
          t('style.arrange'),
          <div className="flex flex-col gap-y-0.5">
            {(
              [
                ['style.bringToFront', layerActions.onBringToFront, ArrowUpToLine],
                ['style.bringForward', layerActions.onBringForward, MoveUp],
                ['style.sendBackward', layerActions.onSendBackward, MoveDown],
                ['style.sendToBack', layerActions.onSendToBack, ArrowDownToLine],
              ] as const
            ).map(([labelKey, run, Icon]) => (
              <button
                key={labelKey}
                type="button"
                className={menuButtonRowClasses}
                onClick={() => {
                  run();
                  close();
                }}
              >
                <span>{t(labelKey)}</span>
                <Icon aria-hidden="true" className="size-4 shrink-0" />
              </button>
            ))}
          </div>,
          'w-52',
        )}
    </div>
  );
}
