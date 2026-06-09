'use client';

import { Text } from '@canvasflow/ui';
import { useBoards } from '../hooks/use-boards';
import { BoardCard } from './board-card';

export function BoardGrid() {
  const { data: boards, isLoading, isError, error } = useBoards();

  if (isLoading) {
    return <Text tone="muted">Loading boards...</Text>;
  }

  if (isError) {
    return (
      <Text tone="danger">
        Couldn't load boards: {error instanceof Error ? error.message : 'unknown'}
      </Text>
    );
  }

  if (!boards || boards.length === 0) {
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
