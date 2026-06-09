import { Card, CardContent, CardHeader, CardTitle, Text, Badge } from '@canvasflow/ui';
import type { BoardDto } from '../api/boards.client';

export function BoardCard({ board }: { board: BoardDto }) {
  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle>{board.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <Text size="sm" tone="muted">
          {new Date(board.updatedAt).toLocaleDateString()}
        </Text>
        <Badge variant={board.visibility === 'private' ? 'outline' : 'brand'}>
          {board.visibility}
        </Badge>
      </CardContent>
    </Card>
  );
}
