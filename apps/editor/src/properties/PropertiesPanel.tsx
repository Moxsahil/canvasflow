import type { Shape } from '@canvasflow/canvas-engine';
import type { ItemStyle } from '../machine/tool-machine.types';
import { Island, Stack } from '../ui';
import { ColorSwatchRow } from './ColorSwatchRow';
import { OpacitySlider } from './OpacitySlider';
import { OptionButton } from './OptionButton';
import { PanelSection } from './PanelSection';
import type { Arrowhead } from '@canvasflow/canvas-engine';
import { useRef, useState, type ComponentType } from 'react';
import { ColorPickerPopover } from './color/ColorPickerPopover';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArchitectIcon,
  ArrowheadArrowIcon,
  ArrowheadBarIcon,
  ArrowheadCircleIcon,
  ArrowheadCircleOutlineIcon,
  ArrowheadDiamondIcon,
  ArrowheadDiamondOutlineIcon,
  ArrowheadNoneIcon,
  ArrowheadTriangleIcon,
  ArrowheadTriangleOutlineIcon,
  ArtistIcon,
  BringForwardIcon,
  BringToFrontIcon,
  CartoonistIcon,
  ConstantWidthIcon,
  CrossHatchIcon,
  CurvedArrowIcon,
  DashedStrokeIcon,
  DottedStrokeIcon,
  ElbowArrowIcon,
  HachureIcon,
  PressureIcon,
  RoundEdgeIcon,
  SendBackwardIcon,
  SendToBackIcon,
  SharpEdgeIcon,
  SolidFillIcon,
  SolidStrokeIcon,
  StraightArrowIcon,
  StrokeWidthIcon,
} from './icons';
import {
  ARROWHEADS,
  BACKGROUND_SWATCHES,
  FONT_FAMILIES,
  FONT_SIZES,
  STROKE_SWATCHES,
  STROKE_WIDTHS,
} from './palette';
import './PropertiesPanel.css';

/** Glyph per arrowhead kind, shared by the start and end rows. */
const ARROWHEAD_ICONS: Record<Arrowhead, ComponentType> = {
  none: ArrowheadNoneIcon,
  arrow: ArrowheadArrowIcon,
  bar: ArrowheadBarIcon,
  circle: ArrowheadCircleIcon,
  circle_outline: ArrowheadCircleOutlineIcon,
  triangle: ArrowheadTriangleIcon,
  triangle_outline: ArrowheadTriangleOutlineIcon,
  diamond: ArrowheadDiamondIcon,
  diamond_outline: ArrowheadDiamondOutlineIcon,
};

/**
 * Shape kinds a fill colour means something for. Lines and freehand strokes
 * qualify because they can enclose an area — a filled line closes into a
 * polygon, and a freehand stroke fills once it loops back on itself.
 */
const FILLABLE_KINDS: ReadonlySet<Shape['kind']> = new Set([
  'rectangle',
  'ellipse',
  'diamond',
  'line',
  'freehand',
]);
/** Shape kinds whose corners or joints can be rounded off. */
const EDGED_KINDS: ReadonlySet<Shape['kind']> = new Set([
  'rectangle',
  'diamond',
  'line',
  'freehand',
]);

export interface LayerActions {
  onSendToBack: () => void;
  onSendBackward: () => void;
  onBringForward: () => void;
  onBringToFront: () => void;
}

interface PropertiesPanelProps {
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
}

/** Which colour the open picker is editing, and where to anchor it. */
interface OpenPicker {
  target: 'stroke' | 'fill';
  top: number;
  /** Kept so the outside-click handler can tell the trigger apart from a click-away. */
  trigger: HTMLElement;
}

/**
 * The style panel at the top-right. It edits the selection when there is one,
 * and otherwise the style the next drawn shape will take — which is why it
 * appears for an active drawing tool on an empty canvas.
 *
 * Every section is gated on `shapeKinds`: it shows only when it applies to
 * every kind in the current edit target, so a mixed selection falls back to
 * the properties they share.
 */
export function PropertiesPanel({
  style,
  shapeKinds,
  canReorder,
  onStyleChange,
  layerActions,
}: PropertiesPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<OpenPicker | null>(null);

  const openPicker = (target: OpenPicker['target']) => (trigger: HTMLElement) => {
    const container = containerRef.current;
    if (!container) return;
    // Anchor to the trigger's own row rather than the panel top, so the popover
    // lines up with the swatch that opened it however the panel is scrolled.
    const top = trigger.getBoundingClientRect().top - container.getBoundingClientRect().top;
    setPicker((current) => (current?.target === target ? null : { target, top, trigger }));
  };

  const closePicker = () => setPicker(null);

  const every = (predicate: (kind: Shape['kind']) => boolean) =>
    shapeKinds.length > 0 && shapeKinds.every(predicate);

  const isTextOnly = every((k) => k === 'text');
  const showBackground = every((k) => FILLABLE_KINDS.has(k));
  // A hatch pattern is only visible once there's something to hatch.
  const showFill = showBackground && style.fillColor !== null;
  // Text is sized by fontSize and drawn without Rough; an image paints its own
  // pixels and is never outlined. Neither has a stroke to configure.
  const showStroke = !isTextOnly && !every((k) => k === 'image');
  const showEdges = every((k) => EDGED_KINDS.has(k));
  const showPressure = every((k) => k === 'freehand');
  const showArrow = every((k) => k === 'arrow');

  return (
    <div className="cf-properties-container" ref={containerRef}>
      <Island padding={3} className="cf-properties">
        <Stack.Col gap={3}>
          <PanelSection label="Stroke">
            <ColorSwatchRow
              swatches={STROKE_SWATCHES}
              value={style.strokeColor}
              onChange={(strokeColor) => onStyleChange({ strokeColor })}
              onOpenPicker={openPicker('stroke')}
              pickerOpen={picker?.target === 'stroke'}
            />
          </PanelSection>

          {showBackground && (
            <PanelSection label="Background">
              <ColorSwatchRow
                swatches={BACKGROUND_SWATCHES}
                value={style.fillColor}
                onChange={(fillColor) => onStyleChange({ fillColor })}
                onOpenPicker={openPicker('fill')}
                pickerOpen={picker?.target === 'fill'}
              />
            </PanelSection>
          )}

          {showFill && (
            <PanelSection label="Fill">
              <OptionButton
                icon={<HachureIcon />}
                label="Hachure"
                active={style.fillStyle === 'hachure'}
                onClick={() => onStyleChange({ fillStyle: 'hachure' })}
              />
              <OptionButton
                icon={<CrossHatchIcon />}
                label="Cross-hatch"
                active={style.fillStyle === 'cross-hatch'}
                onClick={() => onStyleChange({ fillStyle: 'cross-hatch' })}
              />
              <OptionButton
                icon={<SolidFillIcon />}
                label="Solid"
                active={style.fillStyle === 'solid'}
                onClick={() => onStyleChange({ fillStyle: 'solid' })}
              />
            </PanelSection>
          )}

          {showStroke && (
            <PanelSection label="Stroke width">
              {STROKE_WIDTHS.map(({ value, label }) => (
                <OptionButton
                  key={value}
                  icon={<StrokeWidthIcon weight={value} />}
                  label={label}
                  active={style.strokeWidth === value}
                  onClick={() => onStyleChange({ strokeWidth: value })}
                />
              ))}
            </PanelSection>
          )}

          {showStroke && (
            <PanelSection label="Stroke style">
              <OptionButton
                icon={<SolidStrokeIcon />}
                label="Solid"
                active={style.strokeStyle === 'solid'}
                onClick={() => onStyleChange({ strokeStyle: 'solid' })}
              />
              <OptionButton
                icon={<DashedStrokeIcon />}
                label="Dashed"
                active={style.strokeStyle === 'dashed'}
                onClick={() => onStyleChange({ strokeStyle: 'dashed' })}
              />
              <OptionButton
                icon={<DottedStrokeIcon />}
                label="Dotted"
                active={style.strokeStyle === 'dotted'}
                onClick={() => onStyleChange({ strokeStyle: 'dotted' })}
              />
            </PanelSection>
          )}

          {showPressure && (
            <PanelSection label="Pressure">
              <OptionButton
                icon={<ConstantWidthIcon />}
                label="Constant width"
                active={!style.simulatePressure}
                onClick={() => onStyleChange({ simulatePressure: false })}
              />
              <OptionButton
                icon={<PressureIcon />}
                label="Tapered"
                active={style.simulatePressure}
                onClick={() => onStyleChange({ simulatePressure: true })}
              />
            </PanelSection>
          )}

          {showStroke && (
            <PanelSection label="Sloppiness">
              <OptionButton
                icon={<ArchitectIcon />}
                label="Architect"
                active={style.roughness === 0}
                onClick={() => onStyleChange({ roughness: 0 })}
              />
              <OptionButton
                icon={<ArtistIcon />}
                label="Artist"
                active={style.roughness === 1}
                onClick={() => onStyleChange({ roughness: 1 })}
              />
              <OptionButton
                icon={<CartoonistIcon />}
                label="Cartoonist"
                active={style.roughness === 2}
                onClick={() => onStyleChange({ roughness: 2 })}
              />
            </PanelSection>
          )}

          {showArrow && (
            <PanelSection label="Arrow type">
              <OptionButton
                icon={<StraightArrowIcon />}
                label="Straight"
                active={style.arrowType === 'straight'}
                onClick={() => onStyleChange({ arrowType: 'straight' })}
              />
              <OptionButton
                icon={<CurvedArrowIcon />}
                label="Curved"
                active={style.arrowType === 'curved'}
                onClick={() => onStyleChange({ arrowType: 'curved' })}
              />
              <OptionButton
                icon={<ElbowArrowIcon />}
                label="Elbow"
                active={style.arrowType === 'elbow'}
                onClick={() => onStyleChange({ arrowType: 'elbow' })}
              />
            </PanelSection>
          )}

          {showArrow && (
            <>
              <PanelSection label="Arrowhead start" layout="grid">
                {ARROWHEADS.map(({ value, label }) => {
                  const Icon = ARROWHEAD_ICONS[value];
                  return (
                    <OptionButton
                      key={value}
                      icon={<Icon />}
                      label={label}
                      // The glyphs point right; the start marker faces the
                      // other way, so flip everything but the bare shaft.
                      mirrored={value !== 'none'}
                      active={style.startArrowhead === value}
                      onClick={() => onStyleChange({ startArrowhead: value })}
                    />
                  );
                })}
              </PanelSection>

              <PanelSection label="Arrowhead end" layout="grid">
                {ARROWHEADS.map(({ value, label }) => {
                  const Icon = ARROWHEAD_ICONS[value];
                  return (
                    <OptionButton
                      key={value}
                      icon={<Icon />}
                      label={label}
                      active={style.endArrowhead === value}
                      onClick={() => onStyleChange({ endArrowhead: value })}
                    />
                  );
                })}
              </PanelSection>
            </>
          )}

          {showEdges && (
            <PanelSection label="Edges">
              <OptionButton
                icon={<SharpEdgeIcon />}
                label="Sharp"
                active={style.edges === 'sharp'}
                onClick={() => onStyleChange({ edges: 'sharp' })}
              />
              <OptionButton
                icon={<RoundEdgeIcon />}
                label="Round"
                active={style.edges === 'round'}
                onClick={() => onStyleChange({ edges: 'round' })}
              />
            </PanelSection>
          )}

          {isTextOnly && (
            <>
              <PanelSection label="Font family">
                {FONT_FAMILIES.map(({ value, label }) => (
                  <OptionButton
                    key={label}
                    icon={<span style={{ fontFamily: value, fontSize: 13 }}>A</span>}
                    label={label}
                    active={style.fontFamily === value}
                    onClick={() => onStyleChange({ fontFamily: value })}
                  />
                ))}
              </PanelSection>

              <PanelSection label="Font size">
                {FONT_SIZES.map(({ value, label }) => (
                  <OptionButton
                    key={value}
                    icon={<span style={{ fontSize: 11 }}>{label.charAt(0)}</span>}
                    label={label}
                    active={style.fontSize === value}
                    onClick={() => onStyleChange({ fontSize: value })}
                  />
                ))}
              </PanelSection>

              <PanelSection label="Text align">
                <OptionButton
                  icon={<AlignLeftIcon />}
                  label="Left"
                  active={style.textAlign === 'left'}
                  onClick={() => onStyleChange({ textAlign: 'left' })}
                />
                <OptionButton
                  icon={<AlignCenterIcon />}
                  label="Center"
                  active={style.textAlign === 'center'}
                  onClick={() => onStyleChange({ textAlign: 'center' })}
                />
                <OptionButton
                  icon={<AlignRightIcon />}
                  label="Right"
                  active={style.textAlign === 'right'}
                  onClick={() => onStyleChange({ textAlign: 'right' })}
                />
              </PanelSection>
            </>
          )}

          <PanelSection label="Opacity" layout="block">
            <OpacitySlider
              value={style.opacity}
              onChange={(opacity) => onStyleChange({ opacity })}
            />
          </PanelSection>

          {canReorder && (
            <PanelSection label="Layers">
              <OptionButton
                icon={<SendToBackIcon />}
                label="Send to back"
                onClick={layerActions.onSendToBack}
              />
              <OptionButton
                icon={<SendBackwardIcon />}
                label="Send backward"
                onClick={layerActions.onSendBackward}
              />
              <OptionButton
                icon={<BringForwardIcon />}
                label="Bring forward"
                onClick={layerActions.onBringForward}
              />
              <OptionButton
                icon={<BringToFrontIcon />}
                label="Bring to front"
                onClick={layerActions.onBringToFront}
              />
            </PanelSection>
          )}
        </Stack.Col>
      </Island>

      {picker && (
        <ColorPickerPopover
          key={picker.target}
          title={picker.target === 'stroke' ? 'Stroke colour' : 'Background colour'}
          value={picker.target === 'stroke' ? style.strokeColor : style.fillColor}
          allowTransparent={picker.target === 'fill'}
          top={picker.top}
          trigger={picker.trigger}
          onChange={(next, transient) =>
            onStyleChange(
              picker.target === 'stroke'
                ? // Stroke has no transparent state, so a cleared value is ignored.
                  { strokeColor: next ?? style.strokeColor }
                : { fillColor: next },
              transient,
            )
          }
          onClose={closePicker}
        />
      )}
    </div>
  );
}
