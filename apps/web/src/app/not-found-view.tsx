'use client';

import { NotFoundBoard } from '@canvasflow/ui/not-found-board';
import { WHITEBOARD_HREF } from '@/lib/whiteboard';

/** The shared board, sending people on to the editor, which finds their boards. */
export function NotFoundView() {
  return (
    <NotFoundBoard
      title="This page isn’t on the board."
      body="It may have been moved or deleted. Try dragging the 404 while you’re here."
      action={{ href: WHITEBOARD_HREF, label: 'Back to your boards' }}
      labels={{
        shapes: 'shapes',
        toolbar: 'Drawing tools',
        drawing: 'The number 404, drawn as three shapes you can move',
      }}
    />
  );
}
