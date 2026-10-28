import { useEffect } from 'react';
import { useWorkspaceChanges } from '../workspace';
import {
  billingHistory,
  billingWorkspace,
  type BillingHistory,
  type BillingWorkspace,
} from './billing-api';

/**
 * A workspace's billing, kept for the session so Settings → Billing opens
 * with it already there. Read ahead once the editor knows the workspace, shown
 * at once from here, and read again quietly each time the tab opens.
 */

export interface BillingEntry {
  billing: BillingWorkspace;
  /** The card and the invoices; null for anyone but the owner. */
  history: BillingHistory | null;
}

const kept = new Map<string, BillingEntry>();
const reading = new Map<string, Promise<BillingEntry>>();
const watchers = new Set<(workspaceId: string, entry: BillingEntry) => void>();

function keep(workspaceId: string, entry: BillingEntry): void {
  kept.set(workspaceId, entry);
  for (const watcher of watchers) watcher(workspaceId, entry);
}

/** Told each time a workspace's billing is read again. Returns how to stop. */
export function watchBilling(
  watcher: (workspaceId: string, entry: BillingEntry) => void,
): () => void {
  watchers.add(watcher);
  return () => {
    watchers.delete(watcher);
  };
}

export function cachedBilling(workspaceId: string): BillingEntry | null {
  return kept.get(workspaceId) ?? null;
}

/** Reads it from the gateway, sharing a read already on its way. */
export function loadBilling(workspaceId: string): Promise<BillingEntry> {
  const already = reading.get(workspaceId);
  if (already) return already;
  const read = (async () => {
    const billing = await billingWorkspace(workspaceId);
    const history = billing.role === 'owner' ? await billingHistory(workspaceId) : null;
    const entry = { billing, history };
    keep(workspaceId, entry);
    return entry;
  })().finally(() => reading.delete(workspaceId));
  reading.set(workspaceId, read);
  return read;
}

export function keepBilling(workspaceId: string, entry: BillingEntry): void {
  keep(workspaceId, entry);
}

/** How long after the editor settles the read ahead starts, so it never competes with the board. */
const READ_AHEAD_MS = 2000;

/**
 * Reads the workspace's billing ahead, a moment after the editor has settled,
 * and reads it again when the workspace changes (a plan bought or ended, or
 * the tab coming back from Polar's portal). What was kept stays on show until
 * the new read lands.
 */
export function useBillingReadAhead(workspaceId: string | null): void {
  useEffect(() => {
    if (!workspaceId || kept.has(workspaceId)) return;
    const timer = setTimeout(() => {
      void loadBilling(workspaceId).catch(() => undefined);
    }, READ_AHEAD_MS);
    return () => clearTimeout(timer);
  }, [workspaceId]);

  useWorkspaceChanges(null, (changed) => {
    for (const id of kept.keys()) {
      if (changed === null || changed === id) void loadBilling(id).catch(() => undefined);
    }
  });
}
