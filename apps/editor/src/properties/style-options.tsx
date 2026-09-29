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
  PressureIcon,
  RoundEdgeIcon,
  SharpEdgeIcon,
  SolidFillIcon,
  SolidStrokeIcon,
  StraightArrowIcon,
} from './icons';
import { ARROWHEADS, FONT_FAMILIES, FONT_SIZES, STROKE_WIDTHS } from './palette';

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
  { value: 'solid', label: 'Solid', icon: <SolidStrokeIcon /> },
  { value: 'dashed', label: 'Dashed', icon: <DashedStrokeIcon /> },
  { value: 'dotted', label: 'Dotted', icon: <DottedStrokeIcon /> },
];

export const PRESSURE_OPTIONS: SegmentOption<'constant' | 'tapered'>[] = [
  { value: 'constant', label: 'Constant width', icon: <ConstantWidthIcon /> },
  { value: 'tapered', label: 'Tapered', icon: <PressureIcon /> },
];

export const PATTERN_OPTIONS: SegmentOption<ItemStyle['fillStyle']>[] = [
  { value: 'hachure', label: 'Hatched', icon: <HachureIcon /> },
  { value: 'cross-hatch', label: 'Cross-hatched', icon: <CrossHatchIcon /> },
  { value: 'solid', label: 'Solid', icon: <SolidFillIcon /> },
];

export const LOOK_OPTIONS: SegmentOption<ItemStyle['roughness']>[] = [
  { value: 0, label: 'Architect', icon: <ArchitectIcon /> },
  { value: 1, label: 'Artist', icon: <ArtistIcon /> },
  { value: 2, label: 'Cartoonist', icon: <CartoonistIcon /> },
];

export const CORNER_OPTIONS: SegmentOption<ItemStyle['edges']>[] = [
  { value: 'sharp', label: 'Sharp', icon: <SharpEdgeIcon /> },
  { value: 'round', label: 'Round', icon: <RoundEdgeIcon /> },
];

export const ARROW_TYPE_OPTIONS: SegmentOption<ItemStyle['arrowType']>[] = [
  { value: 'straight', label: 'Straight', icon: <StraightArrowIcon /> },
  { value: 'curved', label: 'Curved', icon: <CurvedArrowIcon /> },
  { value: 'elbow', label: 'Elbow', icon: <ElbowArrowIcon /> },
];

export const ALIGN_OPTIONS: SegmentOption<ItemStyle['textAlign']>[] = [
  { value: 'left', label: 'Left', icon: <AlignLeftIcon /> },
  { value: 'center', label: 'Center', icon: <AlignCenterIcon /> },
  { value: 'right', label: 'Right', icon: <AlignRightIcon /> },
];

export const FONT_OPTIONS: SegmentOption<string>[] = FONT_FAMILIES.map(({ value, label }) => ({
  value,
  label,
  // Each family names itself in its own face.
  icon: <span style={{ fontFamily: value, fontSize: 13 }}>Aa</span>,
}));

/** Short enough to sit four abreast in the value column. */
const FONT_SIZE_ABBREVIATIONS: Record<number, string> = { 16: 'S', 20: 'M', 28: 'L', 36: 'XL' };
export const FONT_SIZE_OPTIONS: SegmentOption<number>[] = FONT_SIZES.map(({ value, label }) => ({
  value,
  label,
  icon: <span>{FONT_SIZE_ABBREVIATIONS[value] ?? label.charAt(0)}</span>,
}));

export const WEIGHT_STEPS = STROKE_WIDTHS.map((width) => width.value);

export function arrowheadLabel(value: Arrowhead): string {
  return ARROWHEADS.find((a) => a.value === value)?.label ?? 'None';
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
  return (
    <div
      className="grid gap-1 p-1"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {ARROWHEADS.map(({ value: option, label }) => {
        const Icon = ARROWHEAD_ICONS[option];
        return (
          <PickerCell
            key={option}
            variant="glyph"
            label={label}
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
