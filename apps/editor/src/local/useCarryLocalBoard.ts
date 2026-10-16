import { useEffect, useRef } from 'react';
import { isImage, type BoardDocument, type Shape } from '@canvasflow/canvas-engine';
import type { CarriedImage } from '../file/embedded-images';
import type { BoardSummary } from '../workspace/workspace-api';
import {
  aimCarry,
  clearCarry,
  markCarried,
  readCarry,
  readLocalDrawing,
  type LocalDrawing,
} from './carry';

interface UseCarryLocalBoardOptions {
  /**
   * An account's board this person may draw on, whose server copy has arrived
   * — only then is it known whether the board is empty.
   */
  ready: boolean;
  boardId: string;
  /** The account owns this board: an empty one of theirs can take the drawing. */
  owns: boolean;
  /** Where a board for the drawing is made, when this one cannot take it. */
  workspaceId: string | null;
  doc: BoardDocument;
  /** What the board for the drawing is called. */
  title: string;
  addBoard: (workspaceId: string, title: string) => Promise<BoardSummary>;
  openBoard: (boardId: string) => void;
  /** Uploads the drawing's pictures, whose shapes are already on the board as pending. */
  adoptImages: (images: ReadonlyMap<string, CarriedImage>) => Promise<void>;
  /** The drawing is on this board: frame it, and say so. */
  onCarried: (shapes: readonly Shape[]) => void;
  /** It was brought over to be shared. */
  onShare: () => void;
  onFailed: () => void;
}

/**
 * Copies the local board into the account, once, when leaving it for an
 * account left a note asking for that — see carry.ts.
 *
 * Onto this board when the note names it, or when it is the account's own and
 * still empty: a new account's first board, made a moment ago by signing up.
 * Otherwise onto a board made for it, so nothing is mixed into work already
 * there; that board is opened, and its own editor does the copying.
 */
export function useCarryLocalBoard(options: UseCarryLocalBoardOptions): void {
  const latest = useRef(options);
  latest.current = options;
  const startedRef = useRef(false);

  const { ready, boardId } = options;

  useEffect(() => {
    if (!ready || startedRef.current) return;
    const note = readCarry();
    // Not for this board: the board made for the drawing is opening instead.
    if (!note || (note.target !== null && note.target !== boardId)) return;
    startedRef.current = true;

    void (async () => {
      const { doc, owns, workspaceId, title, addBoard, openBoard, onFailed } = latest.current;
      let drawing: LocalDrawing | null;
      try {
        drawing = await readLocalDrawing();
      } catch {
        drawing = null;
      }
      if (!drawing) {
        clearCarry();
        return;
      }

      const here = note.target === boardId || (owns && doc.getShapes().length === 0);
      if (here) {
        place(drawing, note.share);
        return;
      }

      if (!workspaceId) {
        clearCarry();
        onFailed();
        return;
      }
      try {
        const board = await addBoard(workspaceId, title);
        aimCarry(note, board.id);
        openBoard(board.id);
      } catch {
        clearCarry();
        onFailed();
      }
    })();

    function place(drawing: LocalDrawing, share: boolean) {
      const { doc, adoptImages, onCarried, onShare } = latest.current;
      // Pending until each picture's upload says otherwise, as an opened file's are.
      const shapes = drawing.shapes.map((shape) =>
        isImage(shape) ? ({ ...shape, status: 'pending' } as Shape) : shape,
      );
      doc.batch(() => {
        for (const shape of shapes) doc.addShape(shape);
      });
      markCarried(drawing.version);
      clearCarry();
      void adoptImages(drawing.images);
      onCarried(shapes);
      if (share) onShare();
    }
  }, [ready, boardId]);
}
