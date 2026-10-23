import type { FC, ReactNode, SVGProps } from 'react';

export function createIcon(children: ReactNode): FC<SVGProps<SVGSVGElement>> {
  const Icon: FC<SVGProps<SVGSVGElement>> = (props) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
  return Icon;
}

// --- tools ---

export const HandIcon = createIcon(
  <>
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
    <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
    <path d="M14 5.5a1.5 1.5 0 0 1 3 0V12" />
    <path d="M17 7.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7l-2.5-3.8a1.5 1.5 0 0 1 2.5-1.7L8 15.5" />
  </>,
);

export const SelectIcon = createIcon(
  <>
    <path d="M4 3l7.6 17.4 2.4-6.6 6.6-2.4z" />
    <path d="M14 14l5 5" />
  </>,
);

export const RectangleIcon = createIcon(<rect x="3.5" y="5" width="17" height="14" rx="2" />);

export const DiamondIcon = createIcon(<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z" />);

export const EllipseIcon = createIcon(<circle cx="12" cy="12" r="8.5" />);

export const ArrowIcon = createIcon(
  <>
    <path d="M4 12h15" />
    <path d="M13 6l6 6-6 6" />
  </>,
);

export const LineIcon = createIcon(<path d="M4.5 18.5L19.5 5.5" />);

export const FreehandIcon = createIcon(
  <>
    <path d="M4 20l3.5-1 10-10a2.5 2.5 0 0 0-3.5-3.5l-10 10z" />
    <path d="M13.5 6.5l3.5 3.5" />
  </>,
);

export const TextIcon = createIcon(
  <>
    <path d="M5 6V4.5h14V6" />
    <path d="M12 4.5v15" />
    <path d="M9 19.5h6" />
  </>,
);

export const LaserIcon = createIcon(
  <>
    <path d="M4.5 19.5L13 11" />
    <path d="M15.5 8.5l2.5-2.5" />
    <path d="M14 4.5V2" />
    <path d="M18.5 9h2.5" />
    <path d="M17.8 4.7l1.7-1.7" />
    <circle cx="14.2" cy="9.8" r="2.6" />
  </>,
);

/** A speech bubble with its tail at the bottom left — where a comment's pin points. */
export const CommentIcon = createIcon(
  <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H9.5L5 20.5V17a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5z" />,
);

export const ImageIcon = createIcon(
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M4 17l4.5-4.5 3 3 3.5-3.5L20 17" />
  </>,
);

// A browser window with a page in it: somebody else's page, shown on the board.
export const EmbedIcon = createIcon(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 8.5h17" />
    <path d="M10 12l-2.25 2.25L10 16.5" />
    <path d="M14 12l2.25 2.25L14 16.5" />
  </>,
);

// Two crossed pairs of rules with the enclosed square left open — the crop
// marks a frame is, rather than the box a rectangle already owns.
export const FrameIcon = createIcon(
  <>
    <path d="M8 3v18" />
    <path d="M16 3v18" />
    <path d="M3 8h18" />
    <path d="M3 16h18" />
  </>,
);

/** A centre with branches leaving it both ways, each ending in a topic. */
export const MindMapIcon = createIcon(
  <>
    <rect x="8.5" y="10" width="7" height="4" rx="1.5" />
    <path d="M15.5 12c1.5 0 1.5-5 3-5" />
    <path d="M15.5 12c1.5 0 1.5 5 3 5" />
    <path d="M8.5 12c-1.5 0-1.5-5-3-5" />
    <path d="M8.5 12c-1.5 0-1.5 5-3 5" />
    <circle cx="20" cy="7" r="1" />
    <circle cx="20" cy="17" r="1" />
    <circle cx="4" cy="7" r="1" />
    <circle cx="4" cy="17" r="1" />
  </>,
);

/** A loose stroke, with the corners it is about to be squared off into. */
export const SketchIcon = createIcon(
  <>
    <path d="M4.5 8.5v-2a2 2 0 0 1 2-2h2" />
    <path d="M15.5 4.5h2a2 2 0 0 1 2 2v2" />
    <path d="M19.5 15.5v2a2 2 0 0 1-2 2h-2" />
    <path d="M8.5 19.5h-2a2 2 0 0 1-2-2v-2" />
    <path d="M8 14.5q2-4 4-2t4-3" />
  </>,
);

export const EraserIcon = createIcon(
  <>
    <path d="M18.5 12.5L11 20H6.5l-2.6-2.6a2 2 0 0 1 0-2.8l8.4-8.4a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8z" />
    <path d="M7.5 11.5l5 5" />
  </>,
);

/**
 * A tipped paint pot with a drop falling from its lip. The same paths make the
 * board's cursor for the tool, where the drop is filled with the colour it pours.
 */
export const BUCKET_ICON_PATHS = {
  pot: 'M19 11 11 3l-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z',
  handle: 'M5 2l5 5',
  rim: 'M2 13h15',
  drop: 'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z',
} as const;

export const BucketIcon = createIcon(
  <>
    <path d={BUCKET_ICON_PATHS.pot} />
    <path d={BUCKET_ICON_PATHS.handle} />
    <path d={BUCKET_ICON_PATHS.rim} />
    <path d={BUCKET_ICON_PATHS.drop} />
  </>,
);

/**
 * A pipette, tip at the bottom left. Only ever a cursor — the bucket's while
 * Alt is held, picking a colour up off the board — so it is kept as paths.
 */
export const EYEDROPPER_ICON_PATHS = [
  'M2 22l1-1h3l9-9',
  'M3 21v-3l9-9',
  'M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z',
] as const;

/** Points up while the overflow is closed; the button rotates it when open. */
export const ChevronUpIcon = createIcon(<path d="M5.5 14.5L12 8l6.5 6.5" />);

// --- chrome ---

export const UndoIcon = createIcon(
  <>
    <path d="M8 8L3.5 12L8 16" />
    <path d="M3.5 12h11a5.5 5.5 0 0 1 0 11h-3" />
  </>,
);

export const RedoIcon = createIcon(
  <>
    <path d="M16 8l4.5 4-4.5 4" />
    <path d="M20.5 12h-11a5.5 5.5 0 0 0 0 11h3" />
  </>,
);

export const ZoomInIcon = createIcon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
    <path d="M10.5 7.5v6M7.5 10.5h6" />
  </>,
);

export const ZoomOutIcon = createIcon(
  <>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
    <path d="M7.5 10.5h6" />
  </>,
);

export const CloseIcon = createIcon(<path d="M6 6l12 12M18 6L6 18" />);

/**
 * The two states of the tool lock. One body, and a shackle that either sits
 * closed on it or stands open off its right shoulder — so the pair reads as one
 * object in two positions rather than as two different icons.
 */
export const LockIcon = createIcon(
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </>,
);

export const UnlockIcon = createIcon(
  <>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 7.9-.8" />
  </>,
);
