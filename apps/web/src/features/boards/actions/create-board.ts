'use server';

import { revalidatePath } from 'next/cache';
import { createBoard } from '../api/boards.client';

export interface CreateBoardResult {
  ok: boolean;
  boardId?: string;
  error?: string;
}

export async function createBoardAction(title?: string): Promise<CreateBoardResult> {
  try {
    const board = await createBoard(title);
    // The grid is a server component reading from the gateway, so the new
    // board only appears once this route's cache is invalidated.
    revalidatePath('/boards');
    return { ok: true, boardId: board.id };
  } catch (err) {
    console.error('Failed to create board:', err);
    return { ok: false, error: 'Could not create board. Please try again.' };
  }
}
