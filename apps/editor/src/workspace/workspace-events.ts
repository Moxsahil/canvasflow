import { useEffect, useRef } from 'react';

/**
 * "Something about a workspace changed" — told to whoever shows workspace data
 * (the sidebar's lists, the Settings people list) so they re-read it.
 *
 * Two things say it. The sync-server, through the board's socket, the moment
 * someone renames a workspace, adds or changes a board in it, or lets someone
 * onto one. And the window coming back into focus, which says it about every
 * workspace: a laptop that slept through a change has no other way to hear of
 * it, since the socket only delivers what happens while it is open.
 *
 * Carries an id and nothing else. Listeners fetch what changed through the
 * routes that authorize them.
 */

/** A workspace's id, or null for "any of them". */
type Listener = (workspaceId: string | null) => void;

const listeners = new Set<Listener>();

export function announceWorkspaceChanged(workspaceId: string | null): void {
  for (const listener of listeners) listener(workspaceId);
}

/** How long a window must have been away before coming back re-reads everything. */
const RETURN_AFTER_MS = 30_000;

let hiddenAt: number | null = null;
let watchingFocus = false;

/**
 * Started by the first listener, and left running: it is one handler for the
 * life of the tab, and it does nothing while nobody is listening.
 */
function watchFocus(): void {
  if (watchingFocus || typeof document === 'undefined') return;
  watchingFocus = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= RETURN_AFTER_MS) {
      announceWorkspaceChanged(null);
    }
    hiddenAt = null;
  });
}

/**
 * Call `onChange` whenever this workspace — or every workspace — is said to
 * have changed. Null listens to every workspace.
 */
export function useWorkspaceChanges(
  workspaceId: string | null,
  onChange: (workspaceId: string | null) => void,
): void {
  // Held in a ref so a new callback each render does not resubscribe.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    watchFocus();
    const listener: Listener = (changed) => {
      if (workspaceId === null || changed === null || changed === workspaceId) {
        onChangeRef.current(changed);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [workspaceId]);
}
