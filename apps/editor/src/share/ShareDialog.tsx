import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TeamInvite, type PermissionLevel, type TeamMember } from '@/components/ui/team-invite';
import {
  createShareLink,
  listMembers,
  listShareLinks,
  removeMember,
  revokeShareLink,
  setMemberRole,
  type BoardMember,
  type ShareLinkSummary,
  type ShareRole,
} from './share-api';
import { QRCode } from './QRCode';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  boardId: string;
  /** Shown as the card's heading; falls back to the id, as the menu does. */
  boardName?: string;
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer: HTMLElement | null;
}

/**
 * The sharing card, in a dialog.
 *
 * Everything visible belongs to TeamInvite — this owns the board's sharing
 * state and translates between it and that card's vocabulary: a session link
 * is what people join by, and "can view"/"can edit" is the role it carries.
 */
export function ShareDialog({
  open,
  onClose,
  boardId,
  boardName,
  portalContainer,
}: ShareDialogProps) {
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [role, setRole] = useState<ShareRole>('editor');
  const [allowGuests, setAllowGuests] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  // At most one link is ever live — see createShareLink.
  const session = links[0] ?? null;

  const refresh = useCallback(async () => {
    try {
      const [nextLinks, nextMembers] = await Promise.all([
        listShareLinks(boardId),
        listMembers(boardId),
      ]);
      setLinks(nextLinks);
      setMembers(nextMembers);

      // The plaintext token exists only in the response that created it, so a
      // reload cannot reconstruct the URL from the server. Remember it for this
      // browser; if it does not match the live session, the session is still
      // shown but without a copyable link.
      const stored = readStoredLink(boardId);
      setUrl(stored && nextLinks[0] && stored.linkId === nextLinks[0].id ? stored.url : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sharing details.');
    }
  }, [boardId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await createShareLink(boardId, { role, allowGuests });
      storeLink(boardId, link.id, link.url);
      setUrl(link.url);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await revokeShareLink(boardId, session.id);
      clearStoredLink(boardId);
      setUrl(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop the session.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it manually.');
    }
  };

  const handleRoleChange = async (userId: string, permission: PermissionLevel) => {
    const next: 'editor' | 'viewer' = permission === 'can-view' ? 'viewer' : 'editor';
    setError(null);
    // Optimistic: the request is a single indexed update, and the list snapping
    // back on failure reads better than a select box that freezes.
    setMembers((current) => current.map((m) => (m.userId === userId ? { ...m, role: next } : m)));
    try {
      await setMemberRole(boardId, userId, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change that role.');
      await refresh();
    }
  };

  const handleRemove = async (userId: string) => {
    setError(null);
    try {
      await removeMember(boardId, userId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that person.');
    }
  };

  const people = useMemo<TeamMember[]>(
    () =>
      members
        .filter((member) => member.status === 'active')
        .map((member) => ({
          id: member.userId,
          name: member.name,
          email: member.isGuest ? 'Guest' : member.email,
          role: toPermission(member.role),
          isOwner: member.isOwner,
        })),
    [members],
  );

  // A live session's terms are fixed at creation, so once one is running the
  // card shows what it granted rather than what is selected for the next one.
  const permission = session ? toPermission(session.role) : toPermission(role);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        container={portalContainer}
        showClose={false}
        aria-describedby={undefined}
        className="w-[min(100%-2rem,32rem)] border-0 bg-transparent p-0 shadow-none"
      >
        <DialogTitle className="sr-only">Share this board</DialogTitle>
        <TeamInvite
          teamName={boardName ?? boardId}
          totalMembers={people.length}
          members={people}
          link={url}
          live={session !== null}
          busy={busy}
          copied={copied}
          error={error}
          permission={permission}
          onPermissionChange={(next) => setRole(next === 'can-view' ? 'viewer' : 'editor')}
          allowGuests={session ? session.allowGuests : allowGuests}
          onAllowGuestsChange={setAllowGuests}
          onStart={handleStart}
          onStop={handleStop}
          onCopy={handleCopy}
          qr={url ? <QRCode value={url} size={128} /> : undefined}
          onUpdateMemberPermission={handleRoleChange}
          onRemoveMember={handleRemove}
          onCancel={onClose}
          portalContainer={portalContainer}
        />
      </DialogContent>
    </Dialog>
  );
}

function toPermission(role: BoardMember['role']): PermissionLevel {
  if (role === 'owner') return 'admin';
  return role === 'viewer' ? 'can-view' : 'can-edit';
}

// --- link memory -----------------------------------------------------------
// The server stores only a hash of the token, so the URL cannot be re-derived.
// Held per board in sessionStorage: it survives a reload, and is gone when the
// tab closes, which is the right lifetime for a credential.

interface StoredLink {
  linkId: string;
  url: string;
}

function storageKey(boardId: string): string {
  return `cf.share.${boardId}`;
}

function readStoredLink(boardId: string): StoredLink | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(boardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLink;
    return typeof parsed.linkId === 'string' && typeof parsed.url === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function storeLink(boardId: string, linkId: string, url: string): void {
  try {
    window.sessionStorage.setItem(storageKey(boardId), JSON.stringify({ linkId, url }));
  } catch {
    // Private browsing can refuse storage; the link is on screen regardless.
  }
}

function clearStoredLink(boardId: string): void {
  try {
    window.sessionStorage.removeItem(storageKey(boardId));
  } catch {
    // Nothing to do.
  }
}
