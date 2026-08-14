import type { SVGProps } from 'react';

/**
 * Panel control glyphs, drawn as strokes rather than filled paths so line
 * weights read at 16px. Everything inherits `currentColor`, so the active and
 * hover states in CSS drive them without per-icon overrides.
 */
const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

// --- fill style ---

export function HachureIcon() {
  return (
    <svg {...base} strokeWidth={1.5}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M6 15l9-9M9 18l9-9M6 10l4-4M14 18l4-4" />
    </svg>
  );
}

export function CrossHatchIcon() {
  return (
    <svg {...base} strokeWidth={1.5}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M6 15l9-9M9 18l9-9M18 15l-9-9M15 18l-9-9" />
    </svg>
  );
}

export function SolidFillIcon() {
  return (
    <svg {...base} strokeWidth={1.5}>
      <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" />
    </svg>
  );
}

// --- stroke width ---

/** A single horizontal rule whose thickness previews the stroke width. */
export function StrokeWidthIcon({ weight }: { weight: number }) {
  return (
    <svg {...base} strokeWidth={weight * 1.5 + 1}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// --- stroke style ---

export function SolidStrokeIcon() {
  return (
    <svg {...base}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function DashedStrokeIcon() {
  return (
    <svg {...base} strokeDasharray="5 4">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function DottedStrokeIcon() {
  return (
    <svg {...base} strokeDasharray="1.5 3.5">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// --- sloppiness ---

export function ArchitectIcon() {
  return (
    <svg {...base} strokeWidth={1.5}>
      <path d="M4 15c4-4 12-4 16 0" />
    </svg>
  );
}

export function ArtistIcon() {
  return (
    <svg {...base} strokeWidth={1.5}>
      <path d="M4 15c2-3 5-1 7-3s4 1 6-1" />
      <path d="M4 17c3-3 5-1 7-3s5 1 7-2" opacity="0.5" />
    </svg>
  );
}

export function CartoonistIcon() {
  return (
    <svg {...base} strokeWidth={1.5}>
      <path d="M3 14c2-4 5 1 7-2s4 3 6-1 3 2 5-1" />
      <path d="M3 17c3-4 4 1 7-2s4 3 6 0 3 1 5-2" opacity="0.6" />
    </svg>
  );
}

// --- edges ---

export function SharpEdgeIcon() {
  return (
    <svg {...base}>
      <path d="M5 19V8a3 3 0 0 1 3-3h11" />
    </svg>
  );
}

export function RoundEdgeIcon() {
  return (
    <svg {...base}>
      <path d="M5 19v-6a8 8 0 0 1 8-8h6" />
    </svg>
  );
}

// --- pressure ---

export function ConstantWidthIcon() {
  return (
    <svg {...base} strokeWidth={2.5}>
      <path d="M4 12h16" />
    </svg>
  );
}

export function PressureIcon() {
  return (
    <svg {...base} stroke="none" fill="currentColor">
      <path d="M3 12c5-3 13-3 18 0-5 3-13 3-18 0z" />
    </svg>
  );
}

// --- arrow type ---

export function StraightArrowIcon() {
  return (
    <svg {...base}>
      <path d="M4 18L18 6" />
      <path d="M12 5h7v7" />
    </svg>
  );
}

export function CurvedArrowIcon() {
  return (
    <svg {...base}>
      <path d="M4 18C6 8 12 5 19 6" />
      <path d="M13 4l6 2-2 6" />
    </svg>
  );
}

export function ElbowArrowIcon() {
  return (
    <svg {...base}>
      <path d="M4 19v-9h11" />
      <path d="M11 6l5 4-5 4" />
    </svg>
  );
}

// --- arrowheads ---
// Each glyph is a shaft running left-to-right with its marker at the right end,
// so the row reads as "what the end of my arrow will look like".

export function ArrowheadNoneIcon() {
  return (
    <svg {...base}>
      <path d="M4 12h16" />
    </svg>
  );
}

export function ArrowheadArrowIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h16" />
      <path d="M13 7l6 5-6 5" />
    </svg>
  );
}

export function ArrowheadBarIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h15" />
      <path d="M18 6v12" />
    </svg>
  );
}

export function ArrowheadCircleIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h11" />
      <circle cx="17" cy="12" r="3.5" fill="currentColor" />
    </svg>
  );
}

export function ArrowheadCircleOutlineIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h11" />
      <circle cx="17" cy="12" r="3.5" />
    </svg>
  );
}

export function ArrowheadTriangleIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h11" />
      <path d="M13 7.5l7 4.5-7 4.5z" fill="currentColor" />
    </svg>
  );
}

export function ArrowheadTriangleOutlineIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h11" />
      <path d="M13 7.5l7 4.5-7 4.5z" />
    </svg>
  );
}

export function ArrowheadDiamondIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h9" />
      <path d="M16 8l4 4-4 4-4-4z" fill="currentColor" />
    </svg>
  );
}

export function ArrowheadDiamondOutlineIcon() {
  return (
    <svg {...base}>
      <path d="M3 12h9" />
      <path d="M16 8l4 4-4 4-4-4z" />
    </svg>
  );
}

// --- text align ---

export function AlignLeftIcon() {
  return (
    <svg {...base}>
      <path d="M4 7h16M4 12h10M4 17h13" />
    </svg>
  );
}

export function AlignCenterIcon() {
  return (
    <svg {...base}>
      <path d="M4 7h16M7 12h10M6 17h12" />
    </svg>
  );
}

export function AlignRightIcon() {
  return (
    <svg {...base}>
      <path d="M4 7h16M10 12h10M7 17h13" />
    </svg>
  );
}

// --- layers ---

export function SendToBackIcon() {
  return (
    <svg {...base}>
      <path d="M12 3v12" />
      <path d="M8 11l4 4 4-4" />
      <line x1="4" y1="20" x2="20" y2="20" />
    </svg>
  );
}

export function SendBackwardIcon() {
  return (
    <svg {...base}>
      <path d="M12 4v14" />
      <path d="M7 13l5 5 5-5" />
    </svg>
  );
}

export function BringForwardIcon() {
  return (
    <svg {...base}>
      <path d="M12 20V6" />
      <path d="M7 11l5-5 5 5" />
    </svg>
  );
}

export function BringToFrontIcon() {
  return (
    <svg {...base}>
      <path d="M12 21V9" />
      <path d="M8 13l4-4 4 4" />
      <line x1="4" y1="4" x2="20" y2="4" />
    </svg>
  );
}
