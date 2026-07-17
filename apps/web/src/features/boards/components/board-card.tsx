'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Text, Badge } from '@canvasflow/ui';
import type { BoardDto } from '../api/boards.client';

interface BoardCardProps {
  board: BoardDto;
}

const EDITOR_URL = process.env.NEXT_PUBLIC_EDITOR_URL ?? 'http://localhost:3002';

export function BoardCard({ board }: BoardCardProps) {
  const [opening, setOpening] = useState(false);

  const handleClick = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const res = await fetch('/api/editor-token');
      if (!res.ok) {
        throw new Error(`Failed to mint editor token: ${res.status}`);
      }
      const { token } = (await res.json()) as { token: string };
      window.location.href = `${EDITOR_URL}/boards/${board.id}#token=${encodeURIComponent(token)}`;
    } catch (err) {
      console.error('Failed to open board:', err);
      setOpening(false);
    }
  };

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={handleClick}>
      <CardHeader>
        <CardTitle>{board.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <Text size="sm" tone="muted">
          {new Date(board.updatedAt).toLocaleDateString()}
        </Text>
        <Badge variant={board.visibility === 'private' ? 'outline' : 'brand'}>
          {opening ? 'Opening...' : board.visibility}
        </Badge>
      </CardContent>
    </Card>
  );
}
