'use client';

import { useState } from 'react';
import { Button, Text } from '@canvasflow/ui';
import { clientEnv } from '@/lib/env.client';
import { createBoardAction } from '../actions/create-board';

const EDITOR_URL = clientEnv.NEXT_PUBLIC_EDITOR_URL;

export function NewBoardButton() {
  // Not useTransition: on React 18 an async transition callback stops being
  // tracked at the first await, so isPending would flip back immediately.
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);

    const result = await createBoardAction();
    if (!result.ok || !result.boardId) {
      setError(result.error ?? 'Could not create board. Please try again.');
      setCreating(false);
      return;
    }

    // Same handoff as opening an existing board: mint a short-lived editor
    // token and pass it to the editor in the URL fragment.
    try {
      const res = await fetch(`/api/editor-token?boardId=${result.boardId}`);
      if (!res.ok) {
        throw new Error(`Failed to mint editor token: ${res.status}`);
      }
      const { token } = (await res.json()) as { token: string };
      window.location.href = `${EDITOR_URL}/boards/${result.boardId}#token=${encodeURIComponent(token)}`;
    } catch (err) {
      // The board exists — only the handoff failed. The action already
      // revalidated the list, so the user can click into it from the grid.
      console.error('Failed to open new board:', err);
      setError('Board created, but opening the editor failed.');
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="primary" onClick={handleClick} disabled={creating}>
        {creating ? 'Creating...' : 'New board'}
      </Button>
      {error && (
        <Text size="sm" tone="danger">
          {error}
        </Text>
      )}
    </div>
  );
}
