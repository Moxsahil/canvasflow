import { Heading, Text, Button } from '@canvasflow/ui';
import { BoardGrid } from '@/features/boards/components/board-grid';

export default function BoardsPage() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Heading level={2}>Boards</Heading>
          <Text tone="secondary" className="mt-1">
            Your collaborative whiteboards
          </Text>
        </div>
        <Button variant="primary">New board</Button>
      </div>

      <BoardGrid />
    </div>
  );
}
