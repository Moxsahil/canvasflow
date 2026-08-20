import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Link2, Loader2, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  type CreatedShareLink,
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

/**
 * Create and manage links that let other people onto this board.
 *
 * Redeeming a link grants access to this board alone — never to the workspace
 * around it — so sharing one drawing cannot disclose the rest of a team's
 * work. That guarantee lives in the database layer; this dialog only chooses
 * the terms.
 */
export function ShareDialog({ open, onClose, boardId, portalContainer }: ShareDialogProps) {
  const [role, setRole] = useState<ShareRole>('editor');
  const [allowGuests, setAllowGuests] = useState(true);
  const [created, setCreated] = useState<CreatedShareLink | null>(null);
  const [links, setLinks] = useState<ShareLinkSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  const refreshLinks = useCallback(async () => {
    try {
      setLinks(await listShareLinks(boardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load existing links.');
    }
  }, [boardId]);

  // Existing links are only interesting while the dialog is up, and fetching
  // them on mount would put an authenticated request on every board open.
  useEffect(() => {
    if (!open) return;
    setError(null);
    void refreshLinks();
  }, [open, refreshLinks]);

  // Each open starts a fresh conversation: a token from a previous session is
  // still valid, but leaving it on screen invites sending the wrong one.
  useEffect(() => {
    if (!open) {
      setCreated(null);
      setCopied(false);
    }
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await createShareLink(boardId, { role, allowGuests });
      setCreated(link);
      await refreshLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a link.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select the link and copy it manually.');
    }
  };

  const handleNativeShare = async () => {
    if (!created) return;
    try {
      await navigator.share({ title: 'Join my board', url: created.url });
    } catch {
      // Includes the user simply dismissing the sheet — not worth reporting.
    }
  };

  const handleRevoke = async (linkId: string) => {
    setError(null);
    try {
      await revokeShareLink(boardId, linkId);
      // Clear the on-screen token too if it was the one just killed, rather
      // than leaving a dead link looking sendable.
      if (created?.id === linkId) setCreated(null);
      await refreshLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that link.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent container={portalContainer} className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this board</DialogTitle>
          <DialogDescription>
            Anyone with the link can open this board — and only this board.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-medium text-(--text-primary-color)">
              People with the link can
            </legend>
            <div className="flex gap-2">
              <RoleOption
                label="Edit"
                description="Draw and change things"
                selected={role === 'editor'}
                onSelect={() => setRole('editor')}
              />
              <RoleOption
                label="View"
                description="Watch, but not change"
                selected={role === 'viewer'}
                onSelect={() => setRole('viewer')}
              />
            </div>
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowGuests}
              onChange={(event) => setAllowGuests(event.target.checked)}
              className="mt-1"
            />
            <span>
              Allow people without an account
              <span className="block text-xs text-(--keybinding-color)">
                They pick a display name and join straight away.
              </span>
            </span>
          </label>

          {!created ? (
            <Button onClick={handleCreate} disabled={busy} className="w-full">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden="true" />
              )}
              {busy ? 'Creating…' : 'Create link'}
            </Button>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <QRCode value={created.url} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <input
                    readOnly
                    value={created.url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full rounded-(--border-radius-md) border border-(--default-border-color) bg-transparent px-2 py-1 text-xs"
                    aria-label="Share link"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCopy} className="flex-1">
                      {copied ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    {typeof navigator !== 'undefined' && 'share' in navigator && (
                      <Button size="sm" variant="outline" onClick={handleNativeShare}>
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Share
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-(--keybinding-color)">
                    Copy it now — this link can&rsquo;t be shown again.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-(--color-danger)">{error}</p>}

          {links.length > 0 && (
            <section className="flex flex-col gap-2 border-t border-(--default-border-color) pt-3">
              <h3 className="text-xs font-medium">Active links</h3>
              <ul className="flex flex-col gap-1">
                {links.map((link) => (
                  <li key={link.id} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{link.role === 'viewer' ? 'View' : 'Edit'}</Badge>
                    <span className="text-(--keybinding-color)">
                      {link.useCount === 0
                        ? 'Never used'
                        : `Used ${link.useCount}${link.maxUses ? ` of ${link.maxUses}` : ''}×`}
                      {link.allowGuests ? '' : ' · sign-in required'}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => handleRevoke(link.id)}
                      title="Turn off this link"
                      aria-label={`Turn off the ${link.role} link`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
