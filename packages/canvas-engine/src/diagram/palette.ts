/**
 * What each diagram colour name paints as.
 *
 * Fills are pale and the outlines deeper versions of the same hue, so a
 * coloured box reads as one colour rather than two. A group is tinted rather
 * than filled: its fill carries an alpha, so the same frame is a faint wash on
 * a light board and on a dark one, and never a slab of colour behind the
 * boxes standing in it.
 */

import type { DiagramColor } from '@canvasflow/types';
import { NOTE_COLORS } from '../shapes/note.js';

export interface DiagramPaint {
  readonly stroke: string;
  readonly fill: string;
  /** A group's wash. */
  readonly tint: string;
}

export const DIAGRAM_PAINT: Record<DiagramColor, DiagramPaint> = {
  gray: { stroke: '#868e96', fill: '#f1f3f5', tint: '#868e9614' },
  blue: { stroke: '#1971c2', fill: '#dbeafe', tint: '#1971c214' },
  green: { stroke: '#2f9e44', fill: '#d3f9d8', tint: '#2f9e4414' },
  orange: { stroke: '#e8590c', fill: '#ffe8cc', tint: '#e8590c14' },
  red: { stroke: '#e03131', fill: '#ffe3e3', tint: '#e0313114' },
  purple: { stroke: '#7048e8', fill: '#e5dbff', tint: '#7048e814' },
  yellow: { stroke: '#e67700', fill: '#fff3bf', tint: '#f08c0014' },
  teal: { stroke: '#0c8599', fill: '#c5f6fa', tint: '#0c859914' },
};

/** A box or group the diagram gave no colour. */
export const DEFAULT_DIAGRAM_COLOR: DiagramColor = 'gray';

/**
 * The words inside a filled box. Fixed rather than the board's ink, which
 * turns light on a dark board — and would then be pale words on a pale box.
 */
export const DIAGRAM_BOX_INK = '#1f2328';

/**
 * The paper a note node is put on for each colour: the note colours, the red
 * a note's pink, so a generated note looks like one stuck down by hand.
 */
export const DIAGRAM_NOTE_PAPER: Record<DiagramColor, string> = {
  yellow: NOTE_COLORS[0],
  orange: NOTE_COLORS[1],
  red: NOTE_COLORS[2],
  purple: NOTE_COLORS[3],
  blue: NOTE_COLORS[4],
  teal: NOTE_COLORS[5],
  green: NOTE_COLORS[6],
  gray: NOTE_COLORS[7],
};
