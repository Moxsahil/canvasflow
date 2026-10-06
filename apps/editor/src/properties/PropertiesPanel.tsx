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
import { BACKGROUND_SWATCHES, STROKE_SWATCHES } from './palette';
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
  /** Every selected shape has words written inside it, whose font can be set. */
  hasText?: boolean;
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
  hasText = false,
}: StyleSurfaceProps) {
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

  const show = styleSections(shapeKinds, style, hasText);
  const paintStroke = (colour: string) => strokeColorFor(colour, darkMode);

  const strokeColourRow = (
    <InspectorRow label="Colour">
      <ColorChip
        label={show.textOnly ? 'Text colour' : 'Stroke colour'}
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
      <InspectorRow label={end === 'start' ? 'Start' : 'End'}>
        <ChoiceChip
          label={end === 'start' ? 'Start arrowhead' : 'End arrowhead'}
          valueLabel={arrowheadLabel(value)}
          icon={<Icon />}
          mirrored={end === 'start' && value !== 'none'}
          expanded={popover?.target === `${end}Arrowhead`}
          onOpen={openPopover(`${end}Arrowhead`)}
        />
      </InspectorRow>
    );
  };

  const textRows = (
    <>
      <InspectorRow label="Font">
        <SegmentedControl
          label="Font"
          value={style.fontFamily}
          options={FONT_OPTIONS}
          onChange={(fontFamily) => onStyleChange({ fontFamily })}
        />
      </InspectorRow>
      <InspectorRow label="Size">
        <SegmentedControl
          label="Font size"
          value={style.fontSize}
          options={FONT_SIZE_OPTIONS}
          onChange={(fontSize) => onStyleChange({ fontSize })}
        />
      </InspectorRow>
      <InspectorRow label="Align">
        <SegmentedControl
          label="Text align"
          value={style.textAlign}
          options={ALIGN_OPTIONS}
          onChange={(textAlign) => onStyleChange({ textAlign })}
        />
      </InspectorRow>
    </>
  );

  const sections: { key: string; node: ReactNode }[] = [];

  if (show.textOnly) {
    sections.push({
      key: 'text',
      node: (
        <InspectorSection title="Text">
          {strokeColourRow}
          {textRows}
        </InspectorSection>
      ),
    });
  } else {
    sections.push({
      key: 'stroke',
      node: (
        <InspectorSection title="Stroke">
          {strokeColourRow}
          {show.stroke && (
            <InspectorRow label="Weight">
              <StepperControl
                label="Stroke weight"
                value={style.strokeWidth}
                steps={WEIGHT_STEPS}
                format={(width) => `${width} px`}
                decreaseLabel="Thinner"
                increaseLabel="Thicker"
                onChange={(strokeWidth) => onStyleChange({ strokeWidth })}
              />
            </InspectorRow>
          )}
          {show.strokeTreatments && (
            <InspectorRow label="Dash">
              <SegmentedControl
                label="Stroke dash"
                value={style.strokeStyle}
                options={DASH_OPTIONS}
                onChange={(strokeStyle) => onStyleChange({ strokeStyle })}
              />
            </InspectorRow>
          )}
          {show.pressure && (
            <InspectorRow label="Pressure">
              <SegmentedControl
                label="Pressure"
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
        <InspectorSection title="Fill">
          <InspectorRow label="Colour">
            <ColorChip
              label="Fill colour"
              value={style.fillColor}
              expanded={popover?.target === 'fill'}
              onOpen={openPopover('fill')}
            />
          </InspectorRow>
          {show.fillPattern && (
            <InspectorRow label="Pattern">
              <SegmentedControl
                label="Fill pattern"
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
        <InspectorSection title="Shape">
          {show.strokeTreatments && (
            <InspectorRow label="Look">
              <SegmentedControl
                label="Look"
                value={style.roughness}
                options={LOOK_OPTIONS}
                onChange={(roughness) => onStyleChange({ roughness })}
              />
            </InspectorRow>
          )}
          {show.corners && (
            <InspectorRow label="Corners">
              <SegmentedControl
                label="Corners"
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
        <InspectorSection title="Arrow">
          <InspectorRow label="Type">
            <SegmentedControl
              label="Arrow type"
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

  if (show.shapeText) {
    sections.push({
      key: 'shapeText',
      node: <InspectorSection title="Text">{textRows}</InspectorSection>,
    });
  }

  sections.push({
    key: 'layer',
    node: (
      <InspectorSection title="Layer">
        <InspectorRow label="Opacity">
          <PercentControl
            label="Opacity"
            value={style.opacity}
            onChange={(opacity) => onStyleChange({ opacity })}
          />
        </InspectorRow>
        {canReorder && (
          <InspectorRow label="Arrange">
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
        aria-label="Style"
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
              ? 'Fill colour'
              : show.textOnly
                ? 'Text colour'
                : 'Stroke colour'
          }
          value={popover.target === 'stroke' ? style.strokeColor : style.fillColor}
          swatches={popover.target === 'stroke' ? STROKE_SWATCHES : BACKGROUND_SWATCHES}
          paint={popover.target === 'stroke' ? paintStroke : undefined}
          position={popoverPosition}
          trigger={popover.trigger}
          onChange={(next, transient) =>
            onStyleChange(
              popover.target === 'stroke'
                ? // Stroke has no transparent state, so a cleared value is ignored.
                  { strokeColor: next ?? style.strokeColor }
                : { fillColor: next },
              transient,
            )
          }
          onClose={closePopover}
        />
      )}

      {popover && arrowheadEnd && (
        <InspectorPopover
          key={popover.target}
          title={arrowheadEnd === 'start' ? 'Start arrowhead' : 'End arrowhead'}
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
  return (
    <div className="flex gap-0.5">
      <InspectorIconButton label="Bring to front" onClick={actions.onBringToFront}>
        <ArrowUpToLine aria-hidden="true" />
      </InspectorIconButton>
      <InspectorIconButton label="Bring forward" onClick={actions.onBringForward}>
        <MoveUp aria-hidden="true" />
      </InspectorIconButton>
      <InspectorIconButton label="Send backward" onClick={actions.onSendBackward}>
        <MoveDown aria-hidden="true" />
      </InspectorIconButton>
      <InspectorIconButton label="Send to back" onClick={actions.onSendToBack}>
        <ArrowDownToLine aria-hidden="true" />
      </InspectorIconButton>
    </div>
  );
}
