import { useQuery } from '@tanstack/react-query';
import { listBoards } from '../api/boards.client';

const QUERY_KEYS = {
  all: ['boards'] as const,
  lists: () => [...QUERY_KEYS.all, 'list'] as const,
};

export function useBoards() {
  return useQuery({
    queryKey: QUERY_KEYS.lists(),
    queryFn: listBoards,
  });
}
