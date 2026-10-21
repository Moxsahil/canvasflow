import type { SVGProps } from 'react';

/**
 * The mark for generated diagrams: two boxes whose lines meet in a filled
 * diamond — the parts of a description coming together into one drawing.
 *
 * CanvasFlow's own, drawn on the same 24-unit grid and stroke as the editor's
 * other icons so it sits beside them at 16px. One component, so a redrawn mark
 * replaces it everywhere at once.
 */
export function DiagramMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2.5" y="3" width="8" height="6" rx="1.8" />
      <circle cx="6.5" cy="18" r="3" />
      <path d="M10.5 6h3a3.5 3.5 0 0 1 3.5 3.5V11" />
      <path d="M9.5 18H11a2 2 0 0 0 2-2v-1" />
      <path d="M17 11.2l3.8 3.8-3.8 3.8-3.8-3.8z" fill="currentColor" />
    </svg>
  );
}
