import { useEffect, useState } from 'react';
import { listWorkspacePeople, type WorkspacePeople } from './people-api';

export type WorkspacePeopleState =
  | { status: 'loading' }
  | ({ status: 'ready' } & WorkspacePeople)
  | { status: 'error'; error: string };

/**
 * Who is in a workspace and who else is on its boards, read once each time it
 * is asked about.
 *
 * Null asks about nothing — a guest, or a workspace list still loading — and
 * stays loading. Switching workspaces drops the old answer at once rather than
 * showing one workspace's people under another's name.
 */
export function useWorkspacePeople(workspaceId: string | null): WorkspacePeopleState {
  const [state, setState] = useState<{ id: string | null; value: WorkspacePeopleState }>({
    id: workspaceId,
    value: { status: 'loading' },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setState({ id: workspaceId, value: { status: 'loading' } });
    listWorkspacePeople(workspaceId, controller.signal).then(
      (people) => setState({ id: workspaceId, value: { status: 'ready', ...people } }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const error = err instanceof Error ? err.message : 'Could not load the members.';
        setState({ id: workspaceId, value: { status: 'error', error } });
      },
    );
    return () => controller.abort();
  }, [workspaceId]);

  return state.id === workspaceId ? state.value : { status: 'loading' };
}
