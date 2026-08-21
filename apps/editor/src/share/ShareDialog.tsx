import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, Play, Share2, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  /** Radix portals out of the tree; the theme tokens live on `.cf-editor`. */
  portalContainer: HTMLElement | null;
}

export function ShareDialog({ open, onClose, boardId, portalContainer }: ShareDialogProps) {
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

  const handleRoleChange = async (userId: string, next: 'editor' | 'viewer') => {
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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent container={portalContainer} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{session ? 'Live collaboration' : 'Share this board'}</DialogTitle>
          <DialogDescription>
            {session
              ? 'This board is open to anyone with the link.'
              : 'Start a session to let other people onto this board — and only this board.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {session ? (
            <ActiveSession
              session={session}
              url={url}
              copied={copied}
              busy={busy}
              onCopy={handleCopy}
              onStop={handleStop}
            />
          ) : (
            <StartSession
              role={role}
              onRoleChange={setRole}
              allowGuests={allowGuests}
              onAllowGuestsChange={setAllowGuests}
              busy={busy}
              onStart={handleStart}
            />
          )}

          {error && <p className="text-xs text-(--color-danger)">{error}</p>}

          <MemberList members={members} onRoleChange={handleRoleChange} onRemove={handleRemove} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StartSession({
  role,
  onRoleChange,
  allowGuests,
  onAllowGuestsChange,
  busy,
  onStart,
}: {
  role: ShareRole;
  onRoleChange: (role: ShareRole) => void;
  allowGuests: boolean;
  onAllowGuestsChange: (value: boolean) => void;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium">People who join can</legend>
        <div className="flex gap-2">
          <RoleOption
            label="Edit"
            description="Draw and change things"
            selected={role === 'editor'}
            onSelect={() => onRoleChange('editor')}
          />
          <RoleOption
            label="View"
            description="Watch, but not change"
            selected={role === 'viewer'}
            onSelect={() => onRoleChange('viewer')}
          />
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowGuests}
          onChange={(event) => onAllowGuestsChange(event.target.checked)}
          className="mt-1"
        />
        <span>
          Allow people without an account
          <span className="block text-xs text-(--keybinding-color)">
            They pick a display name and join straight away.
          </span>
        </span>
      </label>

      <Button onClick={onStart} disabled={busy} className="w-full">
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? 'Starting…' : 'Start session'}
      </Button>
    </>
  );
}

function ActiveSession({
  session,
  url,
  copied,
  busy,
  onCopy,
  onStop,
}: {
  session: ShareLinkSummary;
  url: string | null;
  copied: boolean;
  busy: boolean;
  onCopy: () => void;
  onStop: () => void;
}) {
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <>
      <div className="flex items-start gap-3">
        {url && <QRCode value={url} />}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {url ? (
            <>
              <input
                readOnly
                value={url}
                onFocus={(event) => event.currentTarget.select()}
                className="w-full rounded-(--border-radius-md) border border-(--default-border-color) bg-transparent px-2 py-1 text-xs"
                aria-label="Session link"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={onCopy} className="flex-1">
                  {copied ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                {canShare && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void navigator.share({ url }).catch(() => {})}
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Share
                  </Button>
                )}
              </div>
            </>
          ) : (
            // The token is stored only as a hash, so a session started in
            // another browser cannot have its link shown again here.
            <p className="text-xs text-(--keybinding-color)">
              A session is running, but its link was created elsewhere and can&rsquo;t be shown
              again. Stop it to start a new one.
            </p>
          )}
          <p className="text-xs text-(--keybinding-color)">
            Joining people can {session.role === 'viewer' ? 'view' : 'edit'}
            {session.allowGuests ? '' : ' · sign-in required'} ·{' '}
            {session.useCount === 0 ? 'not used yet' : `used ${session.useCount}×`}
          </p>
        </div>
      </div>

      <Button variant="outline" onClick={onStop} disabled={busy} className="w-full">
        <Square className="h-4 w-4" aria-hidden="true" />
        Stop session
      </Button>
      <p className="text-xs text-(--keybinding-color)">
        Stopping closes the link to anyone new. People already on the board keep their access —
        remove them below.
      </p>
    </>
  );
}

function MemberList({
  members,
  onRoleChange,
  onRemove,
}: {
  members: BoardMember[];
  onRoleChange: (userId: string, role: 'editor' | 'viewer') => void;
  onRemove: (userId: string) => void;
}) {
  const active = members.filter((member) => member.status === 'active');
  if (active.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 border-t border-(--default-border-color) pt-3">
      <h3 className="text-xs font-medium">People with access</h3>
      <ul className="flex flex-col gap-1">
        {active.map((member) => (
          <li key={member.userId} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate" title={member.email}>
              {member.name}
              {member.isGuest && <span className="ml-1 text-(--keybinding-color)">· guest</span>}
            </span>

            {member.isOwner ? (
              <span className="text-(--keybinding-color)">Owner</span>
            ) : (
              <>
                <select
                  value={member.role === 'viewer' ? 'viewer' : 'editor'}
                  onChange={(event) =>
                    onRoleChange(member.userId, event.target.value as 'editor' | 'viewer')
                  }
                  className="rounded-(--border-radius-md) border border-(--default-border-color) bg-transparent px-1 py-0.5 text-xs"
                  aria-label={`Role for ${member.name}`}
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onRemove(member.userId)}
                  title={`Remove ${member.name}`}
                  aria-label={`Remove ${member.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoleOption({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex-1 rounded-(--border-radius-md) border p-2 text-left transition-colors ${
        selected
          ? 'border-(--button-active-border) bg-(--color-surface-primary-container)'
          : 'border-(--default-border-color) hover:bg-(--button-hover-bg)'
      }`}
    >
      <span className="block text-sm font-medium">{label}</span>
      <span className="block text-xs text-(--keybinding-color)">{description}</span>
    </button>
  );
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
