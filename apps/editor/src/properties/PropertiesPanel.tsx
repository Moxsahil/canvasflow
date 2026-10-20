import { Fragment, useRef, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowUpToLine, MoveDown, MoveUp } from 'lucide-react';
import type { Shape } from '@canvasflow/canvas-engine';
import { strokeColorFor } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import { menuSurfaceClasses } from '@/components/ui/menu-look';
import type { ItemStyle } from '../machine/tool-machine.types';
import { ColorPickerPopover } from './color/ColorPickerPopover';
import {
  ChoiceChip,
  ColorChip,
  InspectorDivider,
  InspectorIconButton,
  InspectorPopover,
  InspectorRow,
  InspectorSection,
  PercentControl,
  SegmentedControl,
  StepperControl,
} from './inspector';
import { BACKGROUND_SWATCHES, BUCKET_SWATCHES, STROKE_SWATCHES } from './palette';
import {
  ALIGN_OPTIONS,
  ARROWHEAD_ICONS,
  ARROW_TYPE_OPTIONS,
  ArrowheadGrid,
  CORNER_OPTIONS,
  DASH_OPTIONS,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  LOOK_OPTIONS,
  PATTERN_OPTIONS,
  PRESSURE_OPTIONS,
  WEIGHT_STEPS,
  arrowheadLabel,
} from './style-options';
import { styleSections } from './style-sections';
import { useT } from '../i18n';
import './PropertiesPanel.css';

export interface LayerActions {
  onSendToBack: () => void;
  onSendBackward: () => void;
  onBringForward: () => void;
  onBringToFront: () => void;
}

/** What both of the style surfaces — the docked panel and the floating bar — edit with. */
export interface StyleSurfaceProps {
  /** Style of the selection, or the pending style when nothing is selected. */
  style: ItemStyle;
  /** Kinds currently being edited — decides which sections apply. */
  shapeKinds: readonly Shape['kind'][];
  /** Reordering acts on exactly one shape, so it hides for multi-selection. */
  canReorder: boolean;
  /**
   * `transient` marks a change still in progress (a colour-wheel drag), so the
   * caller can hold off on closing the undo group until the gesture ends.
   */
  onStyleChange: (patch: Partial<ItemStyle>, transient?: boolean) => void;
  layerActions: LayerActions;
  /** Which board the swatches are previewing colours for. */
  darkMode: boolean;
  /**
   * Editing the bucket's settings rather than a shape's — see `styleSections`.
   * `style.fillColor` is then the colour it pours, never null.
   */
  bucket?: boolean;
}

/** Which popover is open, and where to anchor it. */
interface OpenPopover {
  target: 'stroke' | 'fill' | 'startArrowhead' | 'endArrowhead';
  top: number;
  /** Kept so the outside-click handler can tell the trigger apart from a click-away. */
  trigger: HTMLElement;
}

/**
 * The style panel docked on the right edge. It edits the selection when there
 * is one, and otherwise the style the next drawn shape will take — which is
 * why it appears for an active drawing tool on an empty canvas.
 *
 * Laid out as an inspector: each property one row, its name on the left and
 * its value on the right, grouped into sections — see `styleSections` for
 * when each one applies.
 */
export function PropertiesPanel({
  style,
  shapeKinds,
  canReorder,
  onStyleChange,
  layerActions,
  darkMode,
  bucket = false,
}: StyleSurfaceProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<OpenPopover | null>(null);

  const openPopover = (target: OpenPopover['target']) => (trigger: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    // Anchor to the trigger's own row rather than the panel top, so the popover
    // lines up with the chip that opened it however the panel is scrolled.
    const top = trigger.getBoundingClientRect().top - container.getBoundingClientRect().top - 4;
    setPopover((current) => (current?.target === target ? null : { target, top, trigger }));
  };
  const closePopover = () => setPopover(null);
  // Opens inward, into the board: the panel sits against the right edge.
  const popoverPosition = popover ? { top: popover.top, right: 'calc(100% + 0.5rem)' } : {};

  const show = styleSections(shapeKinds, style, bucket);
  const paintStroke = (colour: string) => strokeColorFor(colour, darkMode);

  const strokeColourRow = (
    <InspectorRow label={t('style.colour')}>
      <ColorChip
        label={show.textOnly ? t('style.textColour') : t('style.strokeColour')}
        value={style.strokeColor}
        paint={paintStroke}
        expanded={popover?.target === 'stroke'}
        onOpen={openPopover('stroke')}
      />
    </InspectorRow>
  );

  const arrowheadRow = (end: 'start' | 'end') => {
    const value = end === 'start' ? style.startArrowhead : style.endArrowhead;
    const Icon = ARROWHEAD_ICONS[value];
    return (
      <InspectorRow label={end === 'start' ? t('style.start') : t('style.end')}>
        <ChoiceChip
          label={end === 'start' ? t('style.startArrowhead') : t('style.endArrowhead')}
          valueLabel={t(arrowheadLabel(value))}
          icon={<Icon />}
          mirrored={end === 'start' && value !== 'none'}
          expanded={popover?.target === `${end}Arrowhead`}
          onOpen={openPopover(`${end}Arrowhead`)}
        />
      </InspectorRow>
    );
  };

  const sections: { key: string; node: ReactNode }[] = [];

  if (show.textOnly) {
    sections.push({
      key: 'text',
      node: (
        <InspectorSection title={t('style.text')}>
          {strokeColourRow}
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
        </InspectorSection>
      ),
    });
  } else if (show.strokeColour) {
    sections.push({
      key: 'stroke',
      node: (
        <InspectorSection title={t('style.stroke')}>
          {strokeColourRow}
          {show.stroke && (
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
          )}
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
                onChange={(pressure) => onStyleChange({ simulatePressure: pressure === 'tapered' })}
              />
            </InspectorRow>
          )}
        </InspectorSection>
      ),
    });
  }

  if (show.fill) {
    sections.push({
      key: 'fill',
      node: (
        <InspectorSection title={t('style.fill')}>
          <InspectorRow label={t('style.colour')}>
            <ColorChip
              label={t('style.fillColour')}
              value={style.fillColor}
              expanded={popover?.target === 'fill'}
              onOpen={openPopover('fill')}
            />
          </InspectorRow>
          {show.fillPattern && (
            <InspectorRow label={t('style.pattern')}>
              <SegmentedControl
                label={t('style.fillPattern')}
                value={style.fillStyle}
                options={PATTERN_OPTIONS}
                onChange={(fillStyle) => onStyleChange({ fillStyle })}
              />
            </InspectorRow>
          )}
        </InspectorSection>
      ),
    });
  }

  if (show.strokeTreatments || show.corners) {
    sections.push({
      key: 'shape',
      node: (
        <InspectorSection title={t('style.shape')}>
          {show.strokeTreatments && (
            <InspectorRow label={t('style.look')}>
              <SegmentedControl
                label={t('style.look')}
                value={style.roughness}
                options={LOOK_OPTIONS}
                onChange={(roughness) => onStyleChange({ roughness })}
              />
            </InspectorRow>
          )}
          {show.corners && (
            <InspectorRow label={t('style.corners')}>
              <SegmentedControl
                label={t('style.corners')}
                value={style.edges}
                options={CORNER_OPTIONS}
                onChange={(edges) => onStyleChange({ edges })}
              />
            </InspectorRow>
          )}
        </InspectorSection>
      ),
    });
  }

  if (show.arrow) {
    sections.push({
      key: 'arrow',
      node: (
        <InspectorSection title={t('style.arrow')}>
          <InspectorRow label={t('style.type')}>
            <SegmentedControl
              label={t('style.arrowType')}
              value={style.arrowType}
              options={ARROW_TYPE_OPTIONS}
              onChange={(arrowType) => onStyleChange({ arrowType })}
            />
          </InspectorRow>
          {arrowheadRow('start')}
          {arrowheadRow('end')}
        </InspectorSection>
      ),
    });
  }

  sections.push({
    key: 'layer',
    node: (
      <InspectorSection title={t('style.layer')}>
        <InspectorRow label={t('style.opacity')}>
          <PercentControl
            label={t('style.opacity')}
            value={style.opacity}
            onChange={(opacity) => onStyleChange({ opacity })}
          />
        </InspectorRow>
        {canReorder && (
          <InspectorRow label={t('style.arrange')}>
            <ArrangeButtons actions={layerActions} />
          </InspectorRow>
        )}
      </InspectorSection>
    ),
  });

  const arrowheadEnd =
    popover?.target === 'startArrowhead'
      ? 'start'
      : popover?.target === 'endArrowhead'
        ? 'end'
        : null;

  return (
    <div className="cf-properties-container" ref={containerRef}>
      <aside
        aria-label={t('style.style')}
        className={cn(
          menuSurfaceClasses,
          // Never runs off a short viewport; the popovers sit outside it, so
          // scrolling here cannot clip them.
          'flex max-h-[calc(100vh-8rem)] w-60 flex-col overflow-y-auto p-1 pb-1.5 text-xs',
        )}
        data-testid="properties-panel"
      >
        {sections.map(({ key, node }, index) => (
          <Fragment key={key}>
            {index > 0 && <InspectorDivider />}
            {node}
          </Fragment>
        ))}
      </aside>

      {(popover?.target === 'stroke' || popover?.target === 'fill') && (
        <ColorPickerPopover
          key={popover.target}
          title={
            popover.target === 'fill'
              ? t('style.fillColour')
              : show.textOnly
                ? t('style.textColour')
                : t('style.strokeColour')
          }
          value={popover.target === 'stroke' ? style.strokeColor : style.fillColor}
          swatches={
            popover.target === 'stroke'
              ? STROKE_SWATCHES
              : show.bucket
                ? BUCKET_SWATCHES
                : BACKGROUND_SWATCHES
          }
          paint={popover.target === 'stroke' ? paintStroke : undefined}
          position={popoverPosition}
          trigger={popover.trigger}
          onChange={(next, transient) =>
            onStyleChange(
              popover.target === 'stroke'
                ? // Stroke has no transparent state, so a cleared value is ignored.
                  { strokeColor: next ?? style.strokeColor }
                : // Nor does the bucket's pour.
                  { fillColor: show.bucket ? (next ?? style.fillColor) : next },
              transient,
            )
          }
          onClose={closePopover}
        />
      )}

      {popover && arrowheadEnd && (
        <InspectorPopover
          key={popover.target}
          title={arrowheadEnd === 'start' ? t('style.startArrowhead') : t('style.endArrowhead')}
          position={popoverPosition}
          trigger={popover.trigger}
          onClose={closePopover}
          className="w-44 p-1"
        >
          <ArrowheadGrid
            end={arrowheadEnd}
            columns={3}
            value={arrowheadEnd === 'start' ? style.startArrowhead : style.endArrowhead}
            onPick={(value) => {
              onStyleChange(
                arrowheadEnd === 'start' ? { startArrowhead: value } : { endArrowhead: value },
              );
              closePopover();
            }}
          />
        </InspectorPopover>
      )}
    </div>
  );
}

/** Bring to front, forward, backward and to back, as the context menu orders them. */
export function ArrangeButtons({ actions }: { actions: LayerActions }) {
  const t = useT();
  return (
    <div className="flex gap-0.5">
      <InspectorIconButton label={t('style.bringToFront')} onClick={actions.onBringToFront}>
        <ArrowUpToLine aria-hidden="true" />
      </InspectorIconButton>
      <InspectorIconButton label={t('style.bringForward')} onClick={actions.onBringForward}>
        <MoveUp aria-hidden="true" />
      </InspectorIconButton>
      <InspectorIconButton label={t('style.sendBackward')} onClick={actions.onSendBackward}>
        <MoveDown aria-hidden="true" />
      </InspectorIconButton>
      <InspectorIconButton label={t('style.sendToBack')} onClick={actions.onSendToBack}>
        <ArrowDownToLine aria-hidden="true" />
      </InspectorIconButton>
    </div>
  );
}
