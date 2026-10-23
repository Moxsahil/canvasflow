import type { ComponentType } from 'react';
import type { Arrowhead } from '@canvasflow/canvas-engine';
import { cn } from '@/lib/utils';
import type { ItemStyle } from '../machine/tool-machine.types';
import { PickerCell, type SegmentOption } from './inspector';
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
  CartoonistIcon,
  ConstantWidthIcon,
  CrossHatchIcon,
  CurvedArrowIcon,
  DashedStrokeIcon,
  DottedStrokeIcon,
  ElbowArrowIcon,
  HachureIcon,
  LinesCurvedIcon,
  LinesElbowIcon,
  LinesStraightIcon,
  MapBothIcon,
  MapDownIcon,
  MapLeftIcon,
  MapRightIcon,
  PressureIcon,
  RoundEdgeIcon,
  SharpEdgeIcon,
  SolidFillIcon,
  SolidStrokeIcon,
  StraightArrowIcon,
  TopicPillIcon,
  TopicRectangleIcon,
  TopicRoundedIcon,
  TopicUnderlineIcon,
} from './icons';
import { ARROWHEADS, FONT_FAMILIES, FONT_SIZES, STROKE_WIDTHS } from './palette';
import { useT, type TranslationKey } from '../i18n';

/**
 * The choices each style control offers, with the glyph that draws each one.
 * One list per property, shared by the docked panel and the floating bar.
 */

/** Glyph per arrowhead kind, shared by the start and end rows. */
export const ARROWHEAD_ICONS: Record<Arrowhead, ComponentType> = {
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

export const DASH_OPTIONS: SegmentOption<ItemStyle['strokeStyle']>[] = [
  { value: 'solid', labelKey: 'style.dash.solid', icon: <SolidStrokeIcon /> },
  { value: 'dashed', labelKey: 'style.dash.dashed', icon: <DashedStrokeIcon /> },
  { value: 'dotted', labelKey: 'style.dash.dotted', icon: <DottedStrokeIcon /> },
];

export const PRESSURE_OPTIONS: SegmentOption<'constant' | 'tapered'>[] = [
  { value: 'constant', labelKey: 'style.pressure.constant', icon: <ConstantWidthIcon /> },
  { value: 'tapered', labelKey: 'style.pressure.tapered', icon: <PressureIcon /> },
];

export const PATTERN_OPTIONS: SegmentOption<ItemStyle['fillStyle']>[] = [
  { value: 'hachure', labelKey: 'style.pattern.hachure', icon: <HachureIcon /> },
  { value: 'cross-hatch', labelKey: 'style.pattern.crossHatch', icon: <CrossHatchIcon /> },
  { value: 'solid', labelKey: 'style.pattern.solid', icon: <SolidFillIcon /> },
];

export const LOOK_OPTIONS: SegmentOption<ItemStyle['roughness']>[] = [
  { value: 0, labelKey: 'style.look.architect', icon: <ArchitectIcon /> },
  { value: 1, labelKey: 'style.look.artist', icon: <ArtistIcon /> },
  { value: 2, labelKey: 'style.look.cartoonist', icon: <CartoonistIcon /> },
];

export const CORNER_OPTIONS: SegmentOption<ItemStyle['edges']>[] = [
  { value: 'sharp', labelKey: 'style.corner.sharp', icon: <SharpEdgeIcon /> },
  { value: 'round', labelKey: 'style.corner.round', icon: <RoundEdgeIcon /> },
];

export const ARROW_TYPE_OPTIONS: SegmentOption<ItemStyle['arrowType']>[] = [
  { value: 'straight', labelKey: 'style.arrowType.straight', icon: <StraightArrowIcon /> },
  { value: 'curved', labelKey: 'style.arrowType.curved', icon: <CurvedArrowIcon /> },
  { value: 'elbow', labelKey: 'style.arrowType.elbow', icon: <ElbowArrowIcon /> },
];

export const MAP_LAYOUT_OPTIONS: SegmentOption<ItemStyle['mapLayout']>[] = [
  { value: 'both', labelKey: 'style.mapLayout.both', icon: <MapBothIcon /> },
  { value: 'right', labelKey: 'style.mapLayout.right', icon: <MapRightIcon /> },
  { value: 'left', labelKey: 'style.mapLayout.left', icon: <MapLeftIcon /> },
  { value: 'down', labelKey: 'style.mapLayout.down', icon: <MapDownIcon /> },
];

export const MAP_LINES_OPTIONS: SegmentOption<ItemStyle['mapLines']>[] = [
  { value: 'curved', labelKey: 'style.mapLines.curved', icon: <LinesCurvedIcon /> },
  { value: 'straight', labelKey: 'style.mapLines.straight', icon: <LinesStraightIcon /> },
  { value: 'elbow', labelKey: 'style.mapLines.elbow', icon: <LinesElbowIcon /> },
];

export const TOPIC_SHAPE_OPTIONS: SegmentOption<ItemStyle['topicShape']>[] = [
  { value: 'rounded', labelKey: 'style.topicShape.rounded', icon: <TopicRoundedIcon /> },
  { value: 'pill', labelKey: 'style.topicShape.pill', icon: <TopicPillIcon /> },
  { value: 'rectangle', labelKey: 'style.topicShape.rectangle', icon: <TopicRectangleIcon /> },
  { value: 'underline', labelKey: 'style.topicShape.underline', icon: <TopicUnderlineIcon /> },
];

export const ALIGN_OPTIONS: SegmentOption<ItemStyle['textAlign']>[] = [
  { value: 'left', labelKey: 'style.align.left', icon: <AlignLeftIcon /> },
  { value: 'center', labelKey: 'style.align.center', icon: <AlignCenterIcon /> },
  { value: 'right', labelKey: 'style.align.right', icon: <AlignRightIcon /> },
];

export const FONT_OPTIONS: SegmentOption<string>[] = FONT_FAMILIES.map(({ value, labelKey }) => ({
  value,
  labelKey,
  // Each family names itself in its own face.
  icon: <span style={{ fontFamily: value, fontSize: 13 }}>Aa</span>,
}));

/** Short enough to sit four abreast in the value column. */
const FONT_SIZE_ABBREVIATIONS: Record<number, string> = { 16: 'S', 20: 'M', 28: 'L', 36: 'XL' };
export const FONT_SIZE_OPTIONS: SegmentOption<number>[] = FONT_SIZES.map(({ value, labelKey }) => ({
  value,
  labelKey,
  icon: <span>{FONT_SIZE_ABBREVIATIONS[value] ?? value}</span>,
}));

export const WEIGHT_STEPS = STROKE_WIDTHS.map((width) => width.value);

export function arrowheadLabel(value: Arrowhead): TranslationKey {
  return ARROWHEADS.find((a) => a.value === value)?.labelKey ?? 'style.arrowhead.none';
}

/**
 * Every arrowhead as a grid of glyphs, the one in effect lit. The glyphs point
 * right, so the start of an arrow flips all but the bare shaft to face out.
 */
export function ArrowheadGrid({
  end,
  value,
  columns,
  onPick,
}: {
  end: 'start' | 'end';
  value: Arrowhead;
  columns: number;
  onPick: (value: Arrowhead) => void;
}) {
  const t = useT();
  return (
    <div
      className="grid gap-1 p-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {ARROWHEADS.map(({ value: option, labelKey }) => {
        const Icon = ARROWHEAD_ICONS[option];
        return (
          <PickerCell
            key={option}
            variant="glyph"
            label={t(labelKey)}
            selected={value === option}
            className={cn(end === 'start' && option !== 'none' && '[&_svg]:-scale-x-100')}
            onPick={() => onPick(option)}
          >
            <Icon />
          </PickerCell>
        );
      })}
    </div>
  );
}
