import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import rough from 'roughjs';

export interface NotFoundBoardProps {
  title: string;
  body: string;
  /** Where the top-right button goes, and what it says. */
  action: { href: string; label: string };
  /** The words of the page's little editor chrome. */
  labels: { shapes: string; toolbar: string; drawing: string };
  /** Rendered as the top-right link in place of a plain anchor, for a client-side router. */
  renderAction?: (children: ReactNode, style: CSSProperties) => ReactNode;
}

interface Digit {
  kind: 'four' | 'zero';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  seed: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SELECTION = '#4d84fd';
/** How far the selection box stands off the shape it is around. */
const SELECTION_GAP = 8;
const HANDLES = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
] as const;

const TOOL_ICONS = [
  'M4 3l7 18 2.8-7.2L21 11z',
  'M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  'M12 3l9 9-9 9-9-9z',
  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  'M4 12h16M14 6l6 6-6 6',
  'M4 20l4-1 11-11-3-3L5 16z',
  'M5 5h14M12 5v14',
];

function layoutDigits(width: number, height: number): Digit[] {
  const size = Math.min(width / 4.1, height * 0.36);
  const gap = size * 0.2;
  const fourWidth = size * 0.82;
  const zeroWidth = size * 0.8;
  const left = (width - (fourWidth * 2 + zeroWidth + gap * 2)) / 2;
  const top = height * 0.14;
  const shared = { y: top, height: size };
  return [
    { ...shared, kind: 'four', x: left, width: fourWidth, color: '#e03131', seed: 3 },
    {
      ...shared,
      kind: 'zero',
      x: left + fourWidth + gap,
      width: zeroWidth,
      color: '#135dfc',
      seed: 5,
    },
    {
      ...shared,
      kind: 'four',
      x: left + fourWidth + zeroWidth + gap * 2,
      width: fourWidth,
      color: '#2f9e44',
      seed: 8,
    },
  ];
}

function svgElement(tag: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

const chipStyle = {
  position: 'absolute',
  left: 16,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  background: '#111113',
  border: '1px solid #29292b',
  borderRadius: 12,
  fontSize: 12,
  color: '#9f9fa9',
  whiteSpace: 'nowrap',
} as const;

const actionStyle = {
  position: 'absolute',
  top: 16,
  right: 16,
  zIndex: 2,
  display: 'inline-flex',
  alignItems: 'center',
  height: 36,
  padding: '0 16px',
  borderRadius: 10,
  background: '#135dfc',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
} as const;

/**
 * The page for an address that leads nowhere: an empty board in the editor's
 * own chrome, with 404 drawn on it as three shapes that can be picked up.
 * Drawn by the same sketchy library as the board, on plain black.
 */
export function NotFoundBoard({ title, body, action, labels, renderAction }: NotFoundBoardProps) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<SVGSVGElement>(null);
  const [digits, setDigits] = useState<Digit[]>([]);
  const [frameHeight, setFrameHeight] = useState(0);
  const [selected, setSelected] = useState(0);
  const moved = useRef(false);
  const drag = useRef<{ x: number; y: number; fromX: number; fromY: number } | null>(null);

  // Until somebody moves a digit, the 404 keeps itself centred in the window.
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => {
      setFrameHeight(element.clientHeight);
      if (!moved.current) setDigits(layoutDigits(element.clientWidth, element.clientHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svg = canvas.current;
    if (!svg) return;
    svg.replaceChildren();
    const draw = rough.svg(svg);
    digits.forEach((digit, index) => {
      const { x, y, width, height } = digit;
      const options = { stroke: digit.color, strokeWidth: 5, roughness: 1.1, seed: digit.seed };
      const group = svgElement('g', { 'data-digit': index, cursor: 'move' });
      group.append(
        svgElement('rect', { x, y, width, height, fill: 'transparent' }),
        digit.kind === 'zero'
          ? draw.ellipse(x + width / 2, y + height / 2, width, height, options)
          : draw.linearPath(
              [
                [x + width * 0.72, y + height],
                [x + width * 0.72, y],
                [x, y + height * 0.68],
                [x + width, y + height * 0.68],
              ],
              options,
            ),
      );
      svg.append(group);
    });

    const digit = digits[selected];
    if (!digit) return;
    const left = digit.x - SELECTION_GAP;
    const top = digit.y - SELECTION_GAP;
    const width = digit.width + SELECTION_GAP * 2;
    const height = digit.height + SELECTION_GAP * 2;
    const quiet = { 'pointer-events': 'none', stroke: SELECTION, 'stroke-width': 1.5 };
    svg.append(svgElement('rect', { ...quiet, x: left, y: top, width, height, fill: 'none' }));
    for (const [across, down] of HANDLES) {
      svg.append(
        svgElement('rect', {
          ...quiet,
          x: left + width * across - 4,
          y: top + height * down - 4,
          width: 8,
          height: 8,
          fill: '#fff',
        }),
      );
    }
  }, [digits, selected]);

  const pickUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const hit = (event.target as Element).closest('[data-digit]');
      const index = Number(hit?.getAttribute('data-digit'));
      const digit = hit ? digits[index] : undefined;
      if (!digit) return;
      setSelected(index);
      drag.current = { x: event.clientX, y: event.clientY, fromX: digit.x, fromY: digit.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [digits],
  );

  const carry = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const from = drag.current;
      if (!from) return;
      moved.current = true;
      setDigits((current) =>
        current.map((digit, index) =>
          index === selected
            ? {
                ...digit,
                x: from.fromX + event.clientX - from.x,
                y: from.fromY + event.clientY - from.y,
              }
            : digit,
        ),
      );
    },
    [selected],
  );

  const digit = digits[selected];
  // Under the 404's resting place, wherever the digits have been dragged to.
  const messageTop = (digit?.height ?? 0) + frameHeight * 0.19;

  return (
    <main
      ref={frame}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: '#000',
        color: '#fafafa',
        fontFamily: "'Inter Variable', Inter, var(--font-sans), system-ui, sans-serif",
        fontFeatureSettings: "'cv05', 'cv10', 'cv11', 'ss01'",
        userSelect: 'none',
      }}
    >
      <svg
        ref={canvas}
        role="img"
        aria-label={labels.drawing}
        onPointerDown={pickUp}
        onPointerMove={carry}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
        }}
      />

      {digit && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: messageTop,
            padding: '0 20px',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(24px, 3.2vw, 34px)',
              lineHeight: 1.12,
              letterSpacing: '-0.03em',
              fontWeight: 600,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              margin: '8px auto 0',
              maxWidth: '30rem',
              fontSize: 14,
              lineHeight: 1.5,
              color: '#9f9fa9',
            }}
          >
            {body}
          </p>
        </div>
      )}

      {renderAction ? (
        renderAction(action.label, actionStyle)
      ) : (
        <a href={action.href} style={actionStyle}>
          {action.label}
        </a>
      )}

      {digit && (
        <div aria-hidden="true" style={{ ...chipStyle, bottom: 66, gap: 10, padding: '6px 12px' }}>
          <span>
            <b style={{ color: '#fafafa', fontWeight: 600 }}>3</b> {labels.shapes}
          </span>
          <b style={{ color: '#fafafa', fontWeight: 600 }}>404 × 404</b>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            x <b style={{ color: '#fafafa', fontWeight: 600 }}>{Math.round(digit.x)}</b> y{' '}
            <b style={{ color: '#fafafa', fontWeight: 600 }}>{Math.round(digit.y)}</b>
          </span>
        </div>
      )}
      <div aria-hidden="true" style={{ ...chipStyle, bottom: 16, gap: 12, padding: '9px 12px' }}>
        <span>−</span>
        <b style={{ color: SELECTION, fontWeight: 600 }}>404%</b>
        <span>+</span>
      </div>

      <div
        aria-hidden="true"
        title={labels.toolbar}
        className="cf-404-toolbar"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 16,
          transform: 'translateX(-50%)',
          zIndex: 2,
          display: 'flex',
          gap: 4,
          padding: '4px 6px',
          background: '#111113',
          border: '1px solid #29292b',
          borderRadius: 12,
          color: '#fafafa',
        }}
      >
        {TOOL_ICONS.map((path, index) => (
          <span
            key={path}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              borderRadius: 7,
              background: index === 0 ? '#135dfc' : 'transparent',
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={path} />
            </svg>
          </span>
        ))}
      </div>
      {/* A phone has no room for the zoom panel beside the toolbar. */}
      <style>{`@media (max-width: 640px) { .cf-404-toolbar { bottom: 112px !important; } }`}</style>
    </main>
  );
}
