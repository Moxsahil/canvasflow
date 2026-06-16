import { Text } from '@canvasflow/ui';
import { listBoards } from '../api/boards.client';
import { BoardCard } from './board-card';

export async function BoardGrid() {
  const boards = await listBoards();

  if (boards.length === 0) {
    return <Text tone="muted">No boards yet. Create your first one.</Text>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <BoardCard key={board.id} board={board} />
      ))}
    </div>
  );
}
