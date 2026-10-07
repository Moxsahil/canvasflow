import { useEffect, useState } from 'react';
import { listWorkspaceMembers, type WorkspaceMember } from './members-api';

export type WorkspaceMembersState =
  | { status: 'loading' }
  | { status: 'ready'; members: WorkspaceMember[] }
  | { status: 'error'; error: string };

/**
 * Who is in a workspace, read once each time it is asked about.
 *
 * Null asks about nothing — a guest, or a workspace list still loading — and
 * stays loading. Switching workspaces drops the old answer at once rather than
 * showing one workspace's people under another's name.
 */
export function useWorkspaceMembers(workspaceId: string | null): WorkspaceMembersState {
  const [state, setState] = useState<{ id: string | null; value: WorkspaceMembersState }>({
    id: workspaceId,
    value: { status: 'loading' },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    setState({ id: workspaceId, value: { status: 'loading' } });
    listWorkspaceMembers(workspaceId, controller.signal).then(
      (members) => setState({ id: workspaceId, value: { status: 'ready', members } }),
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
