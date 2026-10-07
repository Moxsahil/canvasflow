import { useEffect, useState } from 'react';
import { listWorkspacePeople, type WorkspacePeople } from './people-api';
import { useWorkspaceChanges } from './workspace-events';

export type WorkspacePeopleState =
  | { status: 'loading' }
  | ({ status: 'ready' } & WorkspacePeople)
  | { status: 'error'; error: string };

/**
 * Who is in a workspace and who else is on its boards — read when asked
 * about, and again whenever the workspace is said to have changed.
 *
 * Null asks about nothing — a guest, or a workspace list still loading — and
 * stays loading. Switching workspaces drops the old answer at once rather than
 * showing one workspace's people under another's name; a re-read of the same
 * workspace keeps the list on screen until the new one arrives.
 */
export function useWorkspacePeople(workspaceId: string | null): WorkspacePeopleState {
  const [state, setState] = useState<{ id: string | null; value: WorkspacePeopleState }>({
    id: workspaceId,
    value: { status: 'loading' },
  });
  // Bumped by a change elsewhere, which is what asks the effect to run again.
  const [turn, setTurn] = useState(0);

  useWorkspaceChanges(workspaceId, () => setTurn((n) => n + 1));

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setState((prev) =>
      prev.id === workspaceId && prev.value.status === 'ready'
        ? prev
        : { id: workspaceId, value: { status: 'loading' } },
    );
    listWorkspacePeople(workspaceId, controller.signal).then(
      (people) => setState({ id: workspaceId, value: { status: 'ready', ...people } }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : 'Could not load the members.';
        setState((prev) =>
          // A failed re-read leaves the list that was there.
          prev.id === workspaceId && prev.value.status === 'ready'
            ? prev
            : { id: workspaceId, value: { status: 'error', error } },
        );
      },
    );
    return () => controller.abort();
  }, [workspaceId, turn]);

  return state.id === workspaceId ? state.value : { status: 'loading' };
}
